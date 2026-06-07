// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IStrategy} from "./interfaces/IStrategy.sol";

/// @title VaultCore — ERC-4626 mETH yield optimizer vault for Meridian
contract VaultCore is ERC4626, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    uint256 public constant MAX_STRATEGIES = 8;

    bytes32 public constant KEEPER_ROLE   = keccak256("KEEPER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    address[] public strategies;
    mapping(address => bool)    public isStrategy;
    mapping(address => uint256) public maxAllocationBps;

    uint256 public lastRebalance;
    uint256 public cooldown = 1 hours;
    uint256 public constant MAX_TOTAL_BPS = 10_000;
    uint256 public maxSingleAllocationBps = 7_000;

    event Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdrawn(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Rebalanced(bytes32 indexed reasoningHash, address[] strategies, uint256[] targetBps, uint256 totalAssets);
    event StrategyAdded(address indexed strategy, uint256 maxBps);
    event StrategyRemoved(address indexed strategy);
    event MaxAllocationSet(address indexed strategy, uint256 maxBps);
    event EmergencyPaused(address indexed by, bool fundsPulled);

    error NotAStrategy(address s);
    error CapExceeded(address s, uint256 bps, uint256 cap);
    error TotalBpsExceeded(uint256 total);
    error CooldownActive(uint256 readyAt);
    error LengthMismatch();
    error TooManyStrategies();

    constructor(IERC20 meth, address admin, address keeper, address guardian)
        ERC20("Meridian Vault mETH", "mvmETH")
        ERC4626(meth)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, keeper);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    // Virtual-share offset blunts the ERC-4626 first-depositor inflation attack (OZ v5).
    function _decimalsOffset() internal pure override returns (uint8) { return 6; }

    // ----------------------------------------------------------------
    //  Accounting
    // ----------------------------------------------------------------
    function totalAssets() public view override returns (uint256 total) {
        total = IERC20(asset()).balanceOf(address(this));
        uint256 len = strategies.length;
        for (uint256 i; i < len; ++i) {
            total += IStrategy(strategies[i]).getBalance();
        }
    }

    // ----------------------------------------------------------------
    //  Deposit / withdraw
    // ----------------------------------------------------------------
    function deposit(uint256 assets, address receiver)
        public override nonReentrant whenNotPaused returns (uint256 shares)
    {
        shares = super.deposit(assets, receiver);
        emit Deposited(_msgSender(), receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver)
        public override nonReentrant whenNotPaused returns (uint256 assets)
    {
        assets = super.mint(shares, receiver);
        emit Deposited(_msgSender(), receiver, assets, shares);
    }

    /// @dev withdraw is NOT paused — users must always be able to exit.
    function withdraw(uint256 assets, address receiver, address owner)
        public override nonReentrant returns (uint256 shares)
    {
        _ensureLiquidity(assets);
        shares = super.withdraw(assets, receiver, owner);
        emit Withdrawn(_msgSender(), receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public override nonReentrant returns (uint256 assets)
    {
        assets = previewRedeem(shares);
        _ensureLiquidity(assets);
        assets = super.redeem(shares, receiver, owner);
        emit Withdrawn(_msgSender(), receiver, assets, shares);
    }

    function _ensureLiquidity(uint256 needed) internal {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle >= needed) return;
        uint256 shortfall = needed - idle;
        uint256 len = strategies.length;
        for (uint256 i; i < len && shortfall > 0; ++i) {
            IStrategy s = IStrategy(strategies[i]);
            uint256 bal = s.getBalance();
            if (bal == 0) continue;
            uint256 pull = bal < shortfall ? bal : shortfall;
            uint256 got = s.withdraw(pull);
            shortfall = got >= shortfall ? 0 : shortfall - got;
        }
    }

    // ----------------------------------------------------------------
    //  Rebalance (keeper-only, capped, cooldown-gated)
    // ----------------------------------------------------------------
    function rebalance(address[] calldata strats, uint256[] calldata targetBps, bytes32 reasoningHash)
        external onlyRole(KEEPER_ROLE) whenNotPaused nonReentrant
    {
        if (strats.length != targetBps.length) revert LengthMismatch();
        if (strats.length > MAX_STRATEGIES) revert TooManyStrategies();
        if (block.timestamp < lastRebalance + cooldown) revert CooldownActive(lastRebalance + cooldown);

        uint256 total;
        for (uint256 i; i < strats.length; ++i) {
            if (!isStrategy[strats[i]]) revert NotAStrategy(strats[i]);
            uint256 cap = maxAllocationBps[strats[i]];
            if (targetBps[i] > cap) revert CapExceeded(strats[i], targetBps[i], cap);
            total += targetBps[i];
        }
        if (total > MAX_TOTAL_BPS) revert TotalBpsExceeded(total);

        uint256 tvl = totalAssets();

        // Pass 1: withdraw from over-allocated into idle buffer
        for (uint256 i; i < strats.length; ++i) {
            uint256 target = (tvl * targetBps[i]) / BPS;
            uint256 cur = IStrategy(strats[i]).getBalance();
            if (cur > target) IStrategy(strats[i]).withdraw(cur - target);
        }

        // Pass 2: deploy idle into under-allocated
        for (uint256 i; i < strats.length; ++i) {
            uint256 target = (tvl * targetBps[i]) / BPS;
            uint256 cur = IStrategy(strats[i]).getBalance();
            if (target > cur) {
                uint256 add = target - cur;
                uint256 idle = IERC20(asset()).balanceOf(address(this));
                if (add > idle) add = idle;
                if (add > 0) {
                    IERC20(asset()).safeTransfer(strats[i], add);
                    IStrategy(strats[i]).deploy(add);
                }
            }
        }

        lastRebalance = block.timestamp;
        emit Rebalanced(reasoningHash, strats, targetBps, tvl);
    }

    // ----------------------------------------------------------------
    //  Admin
    // ----------------------------------------------------------------
    function addStrategy(address s, uint256 maxBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!isStrategy[s] && s != address(0), "bad strategy");
        require(IStrategy(s).asset() == asset() && IStrategy(s).vault() == address(this), "mismatch");
        require(maxBps <= maxSingleAllocationBps, "cap too high");
        require(strategies.length < MAX_STRATEGIES, "too many");
        isStrategy[s] = true;
        maxAllocationBps[s] = maxBps;
        strategies.push(s);
        emit StrategyAdded(s, maxBps);
    }

    function setMaxAllocation(address s, uint256 maxBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isStrategy[s], "unknown");
        require(maxBps <= maxSingleAllocationBps, "cap too high");
        maxAllocationBps[s] = maxBps;
        emit MaxAllocationSet(s, maxBps);
    }

    function removeStrategy(address s) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isStrategy[s], "unknown");
        IStrategy(s).withdrawAll();
        isStrategy[s] = false;
        maxAllocationBps[s] = 0;
        uint256 len = strategies.length;
        for (uint256 i; i < len; ++i) {
            if (strategies[i] == s) {
                strategies[i] = strategies[len - 1];
                strategies.pop();
                break;
            }
        }
        emit StrategyRemoved(s);
    }

    function setCooldown(uint256 s) external onlyRole(DEFAULT_ADMIN_ROLE) { cooldown = s; }

    // ----------------------------------------------------------------
    //  Emergency
    // ----------------------------------------------------------------
    function emergencyPause(bool pullFunds) external onlyRole(GUARDIAN_ROLE) {
        _pause();
        if (pullFunds) {
            uint256 len = strategies.length;
            for (uint256 i; i < len; ++i) {
                try IStrategy(strategies[i]).withdrawAll() {} catch {}
            }
        }
        emit EmergencyPaused(_msgSender(), pullFunds);
    }

    // Pausing is instant (guardian); unpausing requires admin multisig — asymmetric by design.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function getStrategies() external view returns (address[] memory) { return strategies; }
}

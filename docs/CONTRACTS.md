# Meridian — Smart Contract Specification

Solidity `^0.8.24`, Foundry, OpenZeppelin v5. Every signature below is
copy-pasteable. Design rationale is inline as `// WHY:` comments.

**Contract set**
1. `VaultCore.sol` — ERC-4626 vault (custody + accounting + rebalance control)
2. `StrategyBase.sol` — abstract strategy interface (mETH-denominated)
3. `CmethStrategy.sol` — mETH → cmETH restaking
4. `AaveStrategy.sol` — mETH → WETH → Aave V3 supply
5. `UsdyStrategy.sol` — mETH → USDC → USDY (mock on testnet)
6. `MeridianRegistry.sol` — ERC-8004 agent identity + on-chain decision log
7. Mocks (testnet): `MockWETH`, `MockCmETH`, `MockUSDY`, `MockUSDC`, `MockAavePool`, `MockSwapRouter`

Shared constants:
```solidity
uint256 constant BPS = 10_000;          // 100.00%
uint256 constant MAX_STRATEGIES = 8;    // bounded loops
```

---

## 1. Interfaces

```solidity
// IStrategy.sol — what the vault calls. All amounts are in mETH terms.
interface IStrategy {
    function deploy(uint256 amountMeth) external;            // vault sent mETH; put it to work
    function withdraw(uint256 amountMeth) external returns (uint256 returnedMeth);
    function withdrawAll() external returns (uint256 returnedMeth);
    function getBalance() external view returns (uint256 methValue);   // current value in mETH
    function getCurrentAPY() external view returns (uint256 bps);      // best-effort, annualized
    function harvest() external returns (uint256 harvestedMeth);       // compound rewards into position
    function asset() external view returns (address);        // == vault.asset() == mETH
    function vault() external view returns (address);
}
```

```solidity
// IAaveV3Pool.sol — minimal Aave V3 surface we use
interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
interface IAaveProtocolDataProvider {
    // currentLiquidityRate is a ray (1e27) per-second-compounded APR
    function getReserveData(address asset) external view returns (
        uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken,
        uint256 totalStableDebt, uint256 totalVariableDebt,
        uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate,
        uint256 averageStableBorrowRate, uint256 liquidityIndex,
        uint256 variableBorrowIndex, uint40 lastUpdateTimestamp
    );
}
```

```solidity
// IAgniSwapRouter.sol — Uniswap V3-style (Agni is a UniV3 fork, Solidity 0.7.6 on-chain)
interface IAgniSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut);
}
```

```solidity
// IcmETH.sol — native restaking wrapper (verify exact ABI on mantlescan before mainnet)
interface IcmETH {
    function deposit(uint256 methAmount, address receiver) external returns (uint256 cmethOut);
    function redeem(uint256 cmethAmount, address receiver, address owner) external returns (uint256 methOut);
    function convertToAssets(uint256 cmethAmount) external view returns (uint256 methValue); // exchange rate
}

// IERC8004Identity.sol — ERC-721 + URIStorage agent registry
interface IERC8004Identity {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function setAgentURI(uint256 agentId, string calldata newURI) external;
    function ownerOf(uint256 agentId) external view returns (address);
}
interface IERC8004Reputation {
    function giveFeedback(uint256 agentId, int8 score, string calldata uri) external returns (uint256 feedbackId);
}
```

---

## 2. `VaultCore.sol`

```solidity
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

    // --- roles ---
    bytes32 public constant KEEPER_ROLE   = keccak256("KEEPER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    // WHY: separate keeper (rebalance only) from guardian (pause only) from admin
    // (whitelist + caps). No single hot key has custody power.

    // --- strategy registry ---
    address[] public strategies;
    mapping(address => bool)    public isStrategy;
    mapping(address => uint256) public maxAllocationBps; // hard cap per strategy

    // --- rebalance guards ---
    uint256 public lastRebalance;
    uint256 public cooldown = 1 hours;          // WHY: rate-limit a rogue/buggy keeper
    uint256 public constant MAX_TOTAL_BPS = 10_000;
    uint256 public maxSingleAllocationBps = 7_000; // WHY: never >70% in one venue

    // --- events ---
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
        _grantRole(DEFAULT_ADMIN_ROLE, admin);   // multisig
        _grantRole(KEEPER_ROLE, keeper);
        _grantRole(GUARDIAN_ROLE, guardian);
    }

    // WHY: virtual-share offset blunts the classic ERC-4626 first-depositor
    // inflation attack (OZ v5).
    function _decimalsOffset() internal pure override returns (uint8) { return 6; }

    // ----------------------------------------------------------------
    //  Accounting — totalAssets is idle mETH + each strategy's mETH value
    // ----------------------------------------------------------------
    function totalAssets() public view override returns (uint256 total) {
        total = IERC20(asset()).balanceOf(address(this)); // idle buffer
        uint256 len = strategies.length;
        for (uint256 i; i < len; ++i) {
            total += IStrategy(strategies[i]).getBalance();
        }
    }

    // ----------------------------------------------------------------
    //  Deposit / withdraw  (deposits rest in idle buffer; keeper deploys)
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

    /// @dev Pulls from idle buffer first, then unwinds strategies in array order.
    function withdraw(uint256 assets, address receiver, address owner)
        public override nonReentrant returns (uint256 shares)
    {
        _ensureLiquidity(assets);                 // WHY: unwind only what's needed
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
            uint256 got = s.withdraw(pull);       // returns actual mETH (may differ via slippage)
            shortfall = got >= shortfall ? 0 : shortfall - got;
        }
        // WHY: if slippage leaves a tiny shortfall, super.withdraw reverts on transfer —
        // user can retry a smaller amount. We never silently short-change.
    }

    // ----------------------------------------------------------------
    //  Rebalance  (keeper-only, capped, cooldown-gated)
    // ----------------------------------------------------------------
    function rebalance(address[] calldata strats, uint256[] calldata targetBps, bytes32 reasoningHash)
        external onlyRole(KEEPER_ROLE) whenNotPaused nonReentrant
    {
        if (strats.length != targetBps.length) revert LengthMismatch();
        if (strats.length > MAX_STRATEGIES) revert TooManyStrategies();
        if (block.timestamp < lastRebalance + cooldown) revert CooldownActive(lastRebalance + cooldown);

        // 1) validate caps + total
        uint256 total;
        for (uint256 i; i < strats.length; ++i) {
            if (!isStrategy[strats[i]]) revert NotAStrategy(strats[i]);
            uint256 cap = maxAllocationBps[strats[i]];
            if (targetBps[i] > cap)  revert CapExceeded(strats[i], targetBps[i], cap);
            total += targetBps[i];
        }
        if (total > MAX_TOTAL_BPS) revert TotalBpsExceeded(total); // remainder stays idle = allowed

        uint256 tvl = totalAssets();

        // 2) first pass: withdraw from over-allocated into idle
        for (uint256 i; i < strats.length; ++i) {
            uint256 target = (tvl * targetBps[i]) / BPS;
            uint256 cur = IStrategy(strats[i]).getBalance();
            if (cur > target) IStrategy(strats[i]).withdraw(cur - target);
        }
        // 3) second pass: deploy idle into under-allocated
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
    //  Admin — strategy whitelist + caps
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
        IStrategy(s).withdrawAll();               // WHY: never strand funds in a removed strategy
        isStrategy[s] = false;
        maxAllocationBps[s] = 0;
        uint256 len = strategies.length;
        for (uint256 i; i < len; ++i) {
            if (strategies[i] == s) { strategies[i] = strategies[len - 1]; strategies.pop(); break; }
        }
        emit StrategyRemoved(s);
    }

    function setCooldown(uint256 s) external onlyRole(DEFAULT_ADMIN_ROLE) { cooldown = s; }

    // ----------------------------------------------------------------
    //  Emergency
    // ----------------------------------------------------------------
    /// @notice Guardian can pause instantly; optionally yank all funds to idle.
    function emergencyPause(bool pullFunds) external onlyRole(GUARDIAN_ROLE) {
        _pause();
        if (pullFunds) {
            uint256 len = strategies.length;
            for (uint256 i; i < len; ++i) {
                try IStrategy(strategies[i]).withdrawAll() {} catch {}
                // WHY: try/catch so one stuck strategy can't block rescuing the rest.
            }
        }
        emit EmergencyPaused(_msgSender(), pullFunds);
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
    // WHY: pausing is fast (guardian); UNpausing requires admin multisig — asymmetric on purpose.

    function getStrategies() external view returns (address[] memory) { return strategies; }
}
```

**Design notes**
- `withdraw` is *not* paused — users must always be able to exit even during a pause
  on new deposits/rebalances. Only `deposit`/`mint`/`rebalance` carry `whenNotPaused`.
- Rebalance leaves any `10000 − Σbps` as an idle buffer on purpose (cheap exit liquidity).
- Two-pass (withdraw-then-deploy) avoids needing more idle than the vault holds mid-rebalance.

---

## 3. `StrategyBase.sol` (abstract)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IStrategy} from "./interfaces/IStrategy.sol";

abstract contract StrategyBase is IStrategy, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    address public immutable override vault;
    address public immutable override asset;   // mETH

    uint256 public slippageBps = 100;           // 1% default; admin-tunable
    uint256 public constant MAX_SLIPPAGE_BPS = 500;

    modifier onlyVault() { require(msg.sender == vault, "only vault"); _; }

    constructor(address _vault, address _meth) Ownable(msg.sender) {
        vault = _vault;
        asset = _meth;
    }

    // children implement these
    function deploy(uint256 amountMeth) external virtual override onlyVault nonReentrant;
    function withdraw(uint256 amountMeth) external virtual override onlyVault nonReentrant returns (uint256);
    function getBalance() public view virtual override returns (uint256);
    function getCurrentAPY() external view virtual override returns (uint256);
    function harvest() external virtual override returns (uint256) { return 0; }

    function withdrawAll() external override onlyVault nonReentrant returns (uint256) {
        return _withdrawAll();
    }
    function _withdrawAll() internal virtual returns (uint256);

    function setSlippage(uint256 bps) external onlyOwner {
        require(bps <= MAX_SLIPPAGE_BPS, "too high");
        slippageBps = bps;
    }

    /// @notice Owner rescue for non-strategy tokens accidentally sent here.
    function sweep(address token, address to) external onlyOwner {
        require(token != asset, "cannot sweep asset"); // WHY: can't rug the principal token
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }
}
```

---

## 4. `CmethStrategy.sol` — the clean one

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StrategyBase} from "./StrategyBase.sol";
import {IcmETH} from "./interfaces/IcmETH.sol";

/// @notice mETH -> cmETH restaking. No external price needed: convertToAssets() gives mETH value.
contract CmethStrategy is StrategyBase {
    using SafeERC20 for IERC20;
    IcmETH public immutable cmeth;

    constructor(address _vault, address _meth, address _cmeth) StrategyBase(_vault, _meth) {
        cmeth = IcmETH(_cmeth);
    }

    function deploy(uint256 amountMeth) external override onlyVault nonReentrant {
        IERC20(asset).forceApprove(address(cmeth), amountMeth);
        cmeth.deposit(amountMeth, address(this));
    }

    function withdraw(uint256 amountMeth) external override onlyVault nonReentrant returns (uint256 out) {
        uint256 cmethBal = IERC20(address(cmeth)).balanceOf(address(this));
        uint256 cmethNeeded = _methToCmeth(amountMeth);
        if (cmethNeeded > cmethBal) cmethNeeded = cmethBal;
        out = cmeth.redeem(cmethNeeded, vault, address(this)); // mETH sent straight to vault
    }

    function _withdrawAll() internal override returns (uint256 out) {
        uint256 cmethBal = IERC20(address(cmeth)).balanceOf(address(this));
        if (cmethBal == 0) return 0;
        out = cmeth.redeem(cmethBal, vault, address(this));
    }

    function getBalance() public view override returns (uint256) {
        return cmeth.convertToAssets(IERC20(address(cmeth)).balanceOf(address(this)));
    }

    function getCurrentAPY() external pure override returns (uint256) {
        return 350; // WHY: restaking APY isn't on-chain readable; keeper overrides via off-chain feed.
    }

    function _methToCmeth(uint256 methAmount) internal view returns (uint256) {
        uint256 oneCmethInMeth = cmeth.convertToAssets(1e18);
        return (methAmount * 1e18) / oneCmethInMeth;
    }
}
```

---

## 5. `AaveStrategy.sol` — mETH → WETH → Aave

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StrategyBase} from "./StrategyBase.sol";
import {IAaveV3Pool, IAaveProtocolDataProvider} from "./interfaces/IAaveV3Pool.sol";
import {IAgniSwapRouter} from "./interfaces/IAgniSwapRouter.sol";

/// @notice mETH <-> WETH (Agni) <-> aWETH (Aave supply). Holds aWETH while deployed.
contract AaveStrategy is StrategyBase {
    using SafeERC20 for IERC20;

    IERC20 public immutable weth;
    IERC20 public immutable aWeth;
    IAaveV3Pool public immutable pool;
    IAaveProtocolDataProvider public immutable dataProvider;
    IAgniSwapRouter public immutable router;
    uint24 public swapFee = 500;          // 0.05% Agni pool tier for mETH/WETH; admin-tunable

    constructor(
        address _vault, address _meth, address _weth, address _aWeth,
        address _pool, address _dataProvider, address _router
    ) StrategyBase(_vault, _meth) {
        weth = IERC20(_weth);
        aWeth = IERC20(_aWeth);
        pool = IAaveV3Pool(_pool);
        dataProvider = IAaveProtocolDataProvider(_dataProvider);
        router = IAgniSwapRouter(_router);
    }

    function deploy(uint256 amountMeth) external override onlyVault nonReentrant {
        uint256 wethOut = _swap(address(IERC20(asset)), address(weth), amountMeth);  // mETH->WETH
        weth.forceApprove(address(pool), wethOut);
        pool.supply(address(weth), wethOut, address(this), 0);
    }

    function withdraw(uint256 amountMeth) external override onlyVault nonReentrant returns (uint256) {
        uint256 wethNeeded = _quote(address(IERC20(asset)), address(weth), amountMeth); // approx WETH for amountMeth
        uint256 got = pool.withdraw(address(weth), wethNeeded, address(this));
        uint256 methOut = _swap(address(weth), address(IERC20(asset)), got);           // WETH->mETH
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    function _withdrawAll() internal override returns (uint256) {
        uint256 bal = aWeth.balanceOf(address(this));
        if (bal == 0) return 0;
        uint256 got = pool.withdraw(address(weth), type(uint256).max, address(this)); // Aave: max = full
        uint256 methOut = _swap(address(weth), address(IERC20(asset)), got);
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    /// @dev aWETH is 1:1 with WETH; convert WETH value to mETH for vault accounting.
    function getBalance() public view override returns (uint256) {
        uint256 wethBal = aWeth.balanceOf(address(this));
        if (wethBal == 0) return 0;
        return _quote(address(weth), address(IERC20(asset)), wethBal); // WETH -> mETH
    }

    function getCurrentAPY() external view override returns (uint256) {
        (, , , , , uint256 liquidityRate, , , , , , ) = dataProvider.getReserveData(address(weth));
        return liquidityRate / 1e23;  // ray(1e27) APR -> bps(1e4): /1e23
    }

    // --- swap + quote helpers (see RISKS.md §6 — these MUST use TWAP, not spot) ---
    function _swap(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256) {
        uint256 minOut = _quote(tokenIn, tokenOut, amountIn) * (BPS - slippageBps) / BPS;
        IERC20(tokenIn).forceApprove(address(router), amountIn);
        return router.exactInputSingle(IAgniSwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn, tokenOut: tokenOut, fee: swapFee, recipient: address(this),
            deadline: block.timestamp, amountIn: amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0
        }));
    }

    /// @dev MUST be a TWAP-based quote with a deviation band. Stubbed here; impl in PriceLib.
    function _quote(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        return PriceLib.twapQuote(tokenIn, tokenOut, amountIn); // reverts if TWAP deviates > band from ref
    }

    uint256 constant BPS = 10_000;
}
```

> **The `_quote` function is the single highest-risk line in Meridian.** It is used
> both to size swaps (`minOut`) *and* to value the position (`getBalance` → `totalAssets`
> → share price). It **must** use a time-weighted price with a deviation guard, never
> `slot0` spot. Full implementation pattern in [RISKS.md](./RISKS.md) §6.

---

## 6. `UsdyStrategy.sol` — mETH → USDC → USDY (mock on testnet)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StrategyBase} from "./StrategyBase.sol";
import {IAgniSwapRouter} from "./interfaces/IAgniSwapRouter.sol";

interface IUSDYLike {
    // Real USDY accrues via internal price; MockUSDY mirrors this with a deposit/withdraw vault.
    function deposit(uint256 usdcAmount, address receiver) external returns (uint256 usdyOut);
    function redeem(uint256 usdyAmount, address receiver) external returns (uint256 usdcOut);
    function convertToUSDC(uint256 usdyAmount) external view returns (uint256 usdcValue);
}

/// @notice RWA / T-bill sleeve. TESTNET: USDY = MockUSDY. MAINNET: requires Ondo KYC
///         integration (see ARCHITECTURE.md §0) — keep capped at 0 on mainnet until then.
contract UsdyStrategy is StrategyBase {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IUSDYLike public immutable usdy;
    IAgniSwapRouter public immutable router;
    uint24 public swapFee = 500;

    constructor(address _vault, address _meth, address _usdc, address _usdy, address _router)
        StrategyBase(_vault, _meth)
    {
        usdc = IERC20(_usdc);
        usdy = IUSDYLike(_usdy);
        router = IAgniSwapRouter(_router);
    }

    function deploy(uint256 amountMeth) external override onlyVault nonReentrant {
        uint256 usdcOut = _swap(address(IERC20(asset)), address(usdc), amountMeth); // mETH->USDC
        usdc.forceApprove(address(usdy), usdcOut);
        usdy.deposit(usdcOut, address(this));
    }

    function withdraw(uint256 amountMeth) external override onlyVault nonReentrant returns (uint256) {
        uint256 usdcNeeded = _quote(address(IERC20(asset)), address(usdc), amountMeth);
        uint256 usdyToRedeem = _usdcToUsdy(usdcNeeded);
        uint256 bal = IERC20(address(usdy)).balanceOf(address(this));
        if (usdyToRedeem > bal) usdyToRedeem = bal;
        uint256 usdcBack = usdy.redeem(usdyToRedeem, address(this));
        uint256 methOut = _swap(address(usdc), address(IERC20(asset)), usdcBack);   // USDC->mETH
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    function _withdrawAll() internal override returns (uint256) {
        uint256 bal = IERC20(address(usdy)).balanceOf(address(this));
        if (bal == 0) return 0;
        uint256 usdcBack = usdy.redeem(bal, address(this));
        uint256 methOut = _swap(address(usdc), address(IERC20(asset)), usdcBack);
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    function getBalance() public view override returns (uint256) {
        uint256 usdyBal = IERC20(address(usdy)).balanceOf(address(this));
        if (usdyBal == 0) return 0;
        uint256 usdcValue = usdy.convertToUSDC(usdyBal);
        return _quote(address(usdc), address(IERC20(asset)), usdcValue); // USDC -> mETH
    }

    function getCurrentAPY() external pure override returns (uint256) {
        return 500; // ~5% T-bill; keeper may override from Ondo's published rate.
    }

    function _usdcToUsdy(uint256 usdcAmount) internal view returns (uint256) {
        uint256 oneUsdyInUsdc = usdy.convertToUSDC(1e18);
        return (usdcAmount * 1e18) / oneUsdyInUsdc;
    }

    function _swap(address tIn, address tOut, uint256 amtIn) internal returns (uint256) {
        uint256 minOut = _quote(tIn, tOut, amtIn) * (BPS - slippageBps) / BPS;
        IERC20(tIn).forceApprove(address(router), amtIn);
        return router.exactInputSingle(IAgniSwapRouter.ExactInputSingleParams({
            tokenIn: tIn, tokenOut: tOut, fee: swapFee, recipient: address(this),
            deadline: block.timestamp, amountIn: amtIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0
        }));
    }
    function _quote(address tIn, address tOut, uint256 amtIn) internal view returns (uint256) {
        return PriceLib.twapQuote(tIn, tOut, amtIn);
    }
    uint256 constant BPS = 10_000;
}
```

---

## 7. `MeridianRegistry.sol` — ERC-8004 identity + on-chain decision log

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC8004Identity, IERC8004Reputation} from "./interfaces/IERC8004.sol";

/// @notice Anchors the AI keeper's identity (ERC-8004) and an immutable decision log.
contract MeridianRegistry is AccessControl {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    IERC8004Identity   public immutable identity;
    IERC8004Reputation public immutable reputation;
    address public immutable vault;
    uint256 public agentId;          // set on register()

    struct Decision {
        uint64  timestamp;
        bytes32 reasoningHash;       // keccak256(cid)
        string  cid;                 // IPFS cid of full reasoning JSON
        int256  perfDeltaBps;        // realized vs passive-hold since last decision
        uint256 totalAssets;         // vault TVL snapshot (mETH) at decision time
    }
    Decision[] public decisions;

    event AgentRegistered(uint256 indexed agentId, string agentURI);
    event DecisionRecorded(uint256 indexed index, bytes32 indexed reasoningHash, string cid, int256 perfDeltaBps);

    constructor(address _vault, address _identity, address _reputation, address keeper) {
        vault = _vault;
        identity = IERC8004Identity(_identity);
        reputation = IERC8004Reputation(_reputation);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KEEPER_ROLE, keeper);
    }

    /// @notice Register the keeper agent on Mantle's ERC-8004 Identity Registry (once).
    function registerAgent(string calldata agentURI) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        require(agentId == 0, "already registered");
        agentId = identity.register(agentURI);   // mints agent NFT to this contract
        emit AgentRegistered(agentId, agentURI);
        return agentId;
    }

    /// @notice Keeper anchors each rebalance's reasoning + realized performance.
    function recordDecision(bytes32 reasoningHash, string calldata cid, int256 perfDeltaBps, uint256 tvl)
        external onlyRole(KEEPER_ROLE)
    {
        require(reasoningHash == keccak256(bytes(cid)), "hash != cid"); // WHY: log can't be forged loose
        decisions.push(Decision(uint64(block.timestamp), reasoningHash, cid, perfDeltaBps, tvl));
        emit DecisionRecorded(decisions.length - 1, reasoningHash, cid, perfDeltaBps);

        // Reputation: positive perf -> positive feedback. Off-chain aggregation per ERC-8004.
        if (agentId != 0) {
            int8 score = perfDeltaBps >= 0 ? int8(1) : int8(-1);
            try reputation.giveFeedback(agentId, score, cid) {} catch {}
        }
    }

    function decisionCount() external view returns (uint256) { return decisions.length; }
    function getDecision(uint256 i) external view returns (Decision memory) { return decisions[i]; }
}
```

---

## 8. Mock contracts (testnet only)

Minimal, clearly-labeled mocks so the full flow runs on Sepolia. **Never deploy to
mainnet.**

```solidity
// MockCmETH — ERC-20 that grows in mETH value over time (simulates restaking yield)
contract MockCmETH is ERC20 {
    IERC20 public meth; uint256 public rate = 1e18; uint256 public lastAccrue; uint256 public apyBps = 350;
    constructor(address _meth) ERC20("Mock cmETH","mcmETH"){ meth = IERC20(_meth); lastAccrue = block.timestamp; }
    function _accrue() internal { rate += rate * apyBps * (block.timestamp-lastAccrue) / (10_000*365 days); lastAccrue = block.timestamp; }
    function deposit(uint256 a, address to) external returns (uint256 out){ _accrue(); meth.transferFrom(msg.sender,address(this),a); out = a*1e18/rate; _mint(to,out); }
    function redeem(uint256 c, address to, address) external returns (uint256 out){ _accrue(); out = c*rate/1e18; _burn(msg.sender,c); meth.transfer(to,out); }
    function convertToAssets(uint256 c) external view returns(uint256){ return c*rate/1e18; }
}
// MockUSDY — same pattern over USDC at ~5% APY.
// MockAavePool — supply()/withdraw() minting/burning a MockAToken that accrues linearly.
// MockSwapRouter — exactInputSingle() at an admin-set price with configurable slippage.
// MockWETH / MockUSDC — standard 18/6-decimal faucet ERC-20s.
```

---

## 9. Test plan (Foundry, ≥80% coverage)

| Layer | Tests |
|---|---|
| Unit — Vault | deposit/mint/withdraw/redeem share math; inflation-attack guard; cap enforcement; cooldown; total/single bps reverts; role gating; pause blocks deposit but not withdraw |
| Unit — Strategies | deploy/withdraw round-trips; getBalance after yield accrual; withdrawAll; slippage revert; sweep can't touch asset |
| Integration — fork | full deposit → rebalance across 3 real strategies → withdraw on a Mantle mainnet fork (real Aave/cmETH/Agni) |
| Integration — Sepolia | same flow against mocks |
| Invariant/fuzz | `Σ getBalance ≈ totalAssets`; share price monotonic absent loss; rebalance never exceeds caps; no strategy holds `asset` dust after withdrawAll |
| Security | reentrancy on withdraw (malicious strategy); rogue-keeper cannot exceed caps; guardian pause; price-deviation revert |

See [KEEPER.md](./KEEPER.md) for the off-chain side and [RISKS.md](./RISKS.md) for the
threat model each security test maps to.

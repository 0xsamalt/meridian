// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IStrategy} from "./interfaces/IStrategy.sol";

/// @notice Abstract base for all Meridian yield strategies.
/// Guards (onlyVault + nonReentrant) are enforced here; children implement _deploy/_withdraw/_withdrawAll.
abstract contract StrategyBase is IStrategy, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    address public immutable override vault;
    address public immutable override asset; // mETH

    uint256 public slippageBps = 100;         // 1% default; owner-tunable
    uint256 public constant MAX_SLIPPAGE_BPS = 500;

    modifier onlyVault() {
        require(msg.sender == vault, "only vault");
        _;
    }

    constructor(address _vault, address _meth) Ownable(msg.sender) {
        vault = _vault;
        asset = _meth;
    }

    // ----------------------------------------------------------------
    //  External entry points — guards applied here so children can't skip them
    // ----------------------------------------------------------------

    function deploy(uint256 amountMeth) external override onlyVault nonReentrant {
        _deploy(amountMeth);
    }

    function withdraw(uint256 amountMeth) external override onlyVault nonReentrant returns (uint256) {
        return _withdraw(amountMeth);
    }

    function withdrawAll() external override onlyVault nonReentrant returns (uint256) {
        return _withdrawAll();
    }

    function harvest() external virtual override returns (uint256) { return 0; }

    // ----------------------------------------------------------------
    //  Internal hooks — children implement these
    // ----------------------------------------------------------------

    function _deploy(uint256 amountMeth) internal virtual;
    function _withdraw(uint256 amountMeth) internal virtual returns (uint256);
    function _withdrawAll() internal virtual returns (uint256);

    // ----------------------------------------------------------------
    //  View — children must implement
    // ----------------------------------------------------------------

    function getBalance() public view virtual override returns (uint256);
    function getCurrentAPY() external view virtual override returns (uint256);

    // ----------------------------------------------------------------
    //  Admin
    // ----------------------------------------------------------------

    function setSlippage(uint256 bps) external onlyOwner {
        require(bps <= MAX_SLIPPAGE_BPS, "too high");
        slippageBps = bps;
    }

    // Owner rescue for non-strategy tokens accidentally sent here.
    function sweep(address token, address to) external onlyOwner {
        require(token != asset, "cannot sweep asset"); // can't rug the principal token
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }
}

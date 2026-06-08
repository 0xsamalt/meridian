// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StrategyBase} from "./StrategyBase.sol";
import {IAaveV3Pool, IAaveProtocolDataProvider} from "./interfaces/IAaveV3Pool.sol";
import {IAgniSwapRouter} from "./interfaces/IAgniSwapRouter.sol";
import {PriceLib} from "./lib/PriceLib.sol";

/// @notice mETH → WETH (Agni swap) → Aave V3 supply. Pool address also serves as DataProvider on testnet.
contract AaveStrategy is StrategyBase {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    IERC20             public immutable weth;
    IAaveV3Pool        public immutable pool;
    IAgniSwapRouter    public immutable router;

    // Tracks WETH value deposited in Aave. In production aTokens are 1:1 with the underlying.
    uint256 internal _wethBalance;

    uint24 public swapFee = 500; // 0.05% Agni pool tier for mETH/WETH; admin-tunable

    constructor(
        address _vault,
        address _meth,
        address _weth,
        address _pool,
        address _router
    ) StrategyBase(_vault, _meth) {
        weth   = IERC20(_weth);
        pool   = IAaveV3Pool(_pool);
        router = IAgniSwapRouter(_router);
    }

    // ----------------------------------------------------------------
    //  StrategyBase hooks
    // ----------------------------------------------------------------

    function _deploy(uint256 amountMeth) internal override {
        uint256 wethOut = _swap(asset, address(weth), amountMeth); // mETH → WETH
        weth.forceApprove(address(pool), wethOut);
        pool.supply(address(weth), wethOut, address(this), 0);
        _wethBalance += wethOut;
    }

    function _withdraw(uint256 amountMeth) internal override returns (uint256) {
        uint256 wethNeeded = _quote(asset, address(weth), amountMeth);
        if (wethNeeded > _wethBalance) wethNeeded = _wethBalance;
        uint256 got = pool.withdraw(address(weth), wethNeeded, address(this));
        _wethBalance = got >= _wethBalance ? 0 : _wethBalance - got;
        uint256 methOut = _swap(address(weth), asset, got); // WETH → mETH
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    function _withdrawAll() internal override returns (uint256) {
        if (_wethBalance == 0) return 0;
        uint256 got = pool.withdraw(address(weth), type(uint256).max, address(this));
        _wethBalance = 0;
        uint256 methOut = _swap(address(weth), asset, got); // WETH → mETH
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    // ----------------------------------------------------------------
    //  Views
    // ----------------------------------------------------------------

    /// @dev _wethBalance is a proxy for aWETH position (1:1 with WETH); convert to mETH.
    function getBalance() public view override returns (uint256) {
        if (_wethBalance == 0) return 0;
        return _quote(address(weth), asset, _wethBalance);
    }

    function getCurrentAPY() external view override returns (uint256) {
        // Use pool as IAaveProtocolDataProvider (MockAavePool implements both)
        (, , , , , uint256 liquidityRate, , , , , , ) =
            IAaveProtocolDataProvider(address(pool)).getReserveData(address(weth));
        return liquidityRate / 1e23; // ray (1e27 APR) → bps (1e4): /1e23
    }

    // ----------------------------------------------------------------
    //  Internal helpers
    // ----------------------------------------------------------------

    function _swap(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256) {
        uint256 minOut = (_quote(tokenIn, tokenOut, amountIn) * (BPS - slippageBps)) / BPS;
        IERC20(tokenIn).forceApprove(address(router), amountIn);
        return router.exactInputSingle(IAgniSwapRouter.ExactInputSingleParams({
            tokenIn:           tokenIn,
            tokenOut:          tokenOut,
            fee:               swapFee,
            recipient:         address(this),
            deadline:          block.timestamp,
            amountIn:          amountIn,
            amountOutMinimum:  minOut,
            sqrtPriceLimitX96: 0
        }));
    }

    /// @dev TWAP-based quote. Reverts if TWAP deviates > MAX_DEVIATION_BPS from reference.
    function _quote(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        return PriceLib.twapQuote(tokenIn, tokenOut, amountIn);
    }

    function setSwapFee(uint24 fee) external onlyOwner { swapFee = fee; }

    // Testnet-only: seed mock prices into this contract's PriceLib storage slot.
    function setMockPrice(address tokenIn, address tokenOut, uint256 priceWad) external onlyOwner {
        PriceLib.setMockPrice(tokenIn, tokenOut, priceWad);
    }
}

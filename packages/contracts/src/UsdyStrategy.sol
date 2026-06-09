// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StrategyBase} from "./StrategyBase.sol";
import {IAgniSwapRouter} from "./interfaces/IAgniSwapRouter.sol";
import {PriceLib} from "./lib/PriceLib.sol";

interface IUSDYLike {
    function deposit(uint256 usdcAmount, address receiver) external returns (uint256 usdyOut);
    function redeem(uint256 usdyAmount, address receiver) external returns (uint256 usdcOut);
    function convertToUSDC(uint256 usdyAmount) external view returns (uint256 usdcValue);
}

/// @notice RWA / T-bill sleeve. mETH → USDC (Agni swap) → USDY.
/// TESTNET: USDY = MockUSDY. MAINNET: requires Ondo KYC integration; keep maxAllocationBps=0 until then.
contract UsdyStrategy is StrategyBase {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    IERC20          public immutable usdc;
    IUSDYLike       public immutable usdy;
    IAgniSwapRouter public immutable router;

    uint24 public swapFee = 500; // 0.05% Agni pool tier; admin-tunable

    constructor(address _vault, address _meth, address _usdc, address _usdy, address _router)
        StrategyBase(_vault, _meth)
    {
        usdc = IERC20(_usdc);
        usdy = IUSDYLike(_usdy);
        router = IAgniSwapRouter(_router);
    }

    function _deploy(uint256 amountMeth) internal override {
        uint256 usdcOut = _swap(asset, address(usdc), amountMeth); // mETH → USDC
        usdc.forceApprove(address(usdy), usdcOut);
        usdy.deposit(usdcOut, address(this));
    }

    function _withdraw(uint256 amountMeth) internal override returns (uint256) {
        uint256 usdcNeeded = _quote(asset, address(usdc), amountMeth);
        uint256 usdyToRedeem = _usdcToUsdy(usdcNeeded);
        uint256 bal = IERC20(address(usdy)).balanceOf(address(this));
        if (usdyToRedeem > bal) usdyToRedeem = bal;
        uint256 usdcBack = usdy.redeem(usdyToRedeem, address(this)); // burns from msg.sender
        uint256 methOut = _swap(address(usdc), asset, usdcBack);     // USDC → mETH
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    function _withdrawAll() internal override returns (uint256) {
        uint256 bal = IERC20(address(usdy)).balanceOf(address(this));
        if (bal == 0) return 0;
        uint256 usdcBack = usdy.redeem(bal, address(this));
        uint256 methOut = _swap(address(usdc), asset, usdcBack); // USDC → mETH
        IERC20(asset).safeTransfer(vault, methOut);
        return methOut;
    }

    function getBalance() public view override returns (uint256) {
        uint256 usdyBal = IERC20(address(usdy)).balanceOf(address(this));
        if (usdyBal == 0) return 0;
        uint256 usdcValue = usdy.convertToUSDC(usdyBal);
        return _quote(address(usdc), asset, usdcValue); // USDC → mETH
    }

    function getCurrentAPY() external pure override returns (uint256) {
        return 500; // ~5% T-bill; keeper may override from Ondo's published rate.
    }

    function _usdcToUsdy(uint256 usdcAmount) internal view returns (uint256) {
        uint256 oneUsdyInUsdc = usdy.convertToUSDC(1e18);
        return (usdcAmount * 1e18) / oneUsdyInUsdc;
    }

    function _swap(address tIn, address tOut, uint256 amtIn) internal returns (uint256) {
        uint256 minOut = (_quote(tIn, tOut, amtIn) * (BPS - slippageBps)) / BPS;
        IERC20(tIn).forceApprove(address(router), amtIn);
        return router.exactInputSingle(IAgniSwapRouter.ExactInputSingleParams({
            tokenIn:           tIn,
            tokenOut:          tOut,
            fee:               swapFee,
            recipient:         address(this),
            deadline:          block.timestamp,
            amountIn:          amtIn,
            amountOutMinimum:  minOut,
            sqrtPriceLimitX96: 0
        }));
    }

    function _quote(address tIn, address tOut, uint256 amtIn) internal view returns (uint256) {
        return PriceLib.twapQuote(tIn, tOut, amtIn);
    }

    function setMockPrice(address tokenIn, address tokenOut, uint256 priceWad) external onlyOwner {
        PriceLib.setMockPrice(tokenIn, tokenOut, priceWad);
    }

    function setSwapFee(uint24 fee) external onlyOwner { swapFee = fee; }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAgniSwapRouter} from "../interfaces/IAgniSwapRouter.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Mock Agni/UniV3 swap router with admin-configurable exchange rate. TESTNET ONLY.
/// Default: 1:1 (10000 bps). Admin can lower rate to test slippage protection.
contract MockSwapRouter {
    uint256 public rateBps = 10_000; // 10000 bps = 1:1

    function exactInputSingle(IAgniSwapRouter.ExactInputSingleParams calldata p)
        external returns (uint256 amountOut)
    {
        amountOut = (p.amountIn * rateBps) / 10_000;
        require(amountOut >= p.amountOutMinimum, "MockSwapRouter: slippage exceeded");
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        IMintable(p.tokenOut).mint(p.recipient, amountOut);
    }

    function setRate(uint256 bps) external { rateBps = bps; }
}

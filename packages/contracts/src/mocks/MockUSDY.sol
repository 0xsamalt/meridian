// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice USDY mock that simulates T-bill yield at ~5% APY over USDC. TESTNET ONLY.
/// 1 USDY starts = 1 USDC (1e6). Rate accrues per second.
contract MockUSDY is ERC20 {
    IERC20  public usdc;
    uint256 public rate = 1e6;          // USDC (6-decimal) per USDY (18-decimal)
    uint256 public lastAccrue;
    uint256 public apyBps = 500;        // 5% APY

    constructor(address _usdc) ERC20("Mock USDY", "mUSDY") {
        usdc = IERC20(_usdc);
        lastAccrue = block.timestamp;
    }

    function _accrue() internal {
        uint256 elapsed = block.timestamp - lastAccrue;
        if (elapsed == 0) return;
        rate += (rate * apyBps * elapsed) / (10_000 * 365 days);
        lastAccrue = block.timestamp;
    }

    function deposit(uint256 usdcAmount, address receiver) external returns (uint256 usdyOut) {
        _accrue();
        usdc.transferFrom(msg.sender, address(this), usdcAmount);
        // usdcAmount is 6-decimal; rate is also 6-decimal per 18-decimal USDY
        usdyOut = (usdcAmount * 1e18) / rate;
        _mint(receiver, usdyOut);
    }

    function redeem(uint256 usdyAmount, address receiver) external returns (uint256 usdcOut) {
        _accrue();
        _burn(msg.sender, usdyAmount);
        usdcOut = (usdyAmount * rate) / 1e18;
        usdc.transfer(receiver, usdcOut);
    }

    function convertToUSDC(uint256 usdyAmount) external view returns (uint256) {
        uint256 elapsed = block.timestamp - lastAccrue;
        uint256 currentRate = rate + (rate * apyBps * elapsed) / (10_000 * 365 days);
        return (usdyAmount * currentRate) / 1e18;
    }
}

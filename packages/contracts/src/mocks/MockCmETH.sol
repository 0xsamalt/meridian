// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice cmETH mock that simulates restaking yield at ~3.5% APY. TESTNET ONLY.
/// Rate accrues per second based on apyBps. 1 cmETH starts = 1 mETH.
contract MockCmETH is ERC20 {
    IERC20  public meth;
    uint256 public rate = 1e18;         // mETH per cmETH (WAD), starts 1:1
    uint256 public lastAccrue;
    uint256 public apyBps = 350;        // 3.5% APY

    constructor(address _meth) ERC20("Mock cmETH", "mcmETH") {
        meth = IERC20(_meth);
        lastAccrue = block.timestamp;
    }

    function _accrue() internal {
        uint256 elapsed = block.timestamp - lastAccrue;
        if (elapsed == 0) return;
        // rate += rate * apyBps * elapsed / (10_000 * 365 days)
        rate += (rate * apyBps * elapsed) / (10_000 * 365 days);
        lastAccrue = block.timestamp;
    }

    function deposit(uint256 methAmount, address receiver) external returns (uint256 cmethOut) {
        _accrue();
        meth.transferFrom(msg.sender, address(this), methAmount);
        cmethOut = (methAmount * 1e18) / rate;
        _mint(receiver, cmethOut);
    }

    function redeem(uint256 cmethAmount, address receiver, address from) external returns (uint256 methOut) {
        _accrue();
        _burn(from, cmethAmount);
        methOut = (cmethAmount * rate) / 1e18;
        meth.transfer(receiver, methOut);
    }

    function convertToAssets(uint256 cmethAmount) external view returns (uint256) {
        // View: compute accrued rate without modifying state
        uint256 elapsed = block.timestamp - lastAccrue;
        uint256 currentRate = rate + (rate * apyBps * elapsed) / (10_000 * 365 days);
        return (cmethAmount * currentRate) / 1e18;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StrategyBase} from "./StrategyBase.sol";
import {IcmETH} from "./interfaces/IcmETH.sol";

/// @notice mETH → cmETH restaking. No external price needed: convertToAssets() gives mETH value.
contract CmethStrategy is StrategyBase {
    using SafeERC20 for IERC20;

    IcmETH public immutable cmeth;

    constructor(address _vault, address _meth, address _cmeth) StrategyBase(_vault, _meth) {
        cmeth = IcmETH(_cmeth);
    }

    function _deploy(uint256 amountMeth) internal override {
        IERC20(asset).forceApprove(address(cmeth), amountMeth);
        cmeth.deposit(amountMeth, address(this));
    }

    function _withdraw(uint256 amountMeth) internal override returns (uint256 out) {
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
        // Restaking APY isn't on-chain readable; keeper overrides via off-chain feed.
        return 350;
    }

    function _methToCmeth(uint256 methAmount) internal view returns (uint256) {
        uint256 oneCmethInMeth = cmeth.convertToAssets(1e18);
        return (methAmount * 1e18) / oneCmethInMeth;
    }
}

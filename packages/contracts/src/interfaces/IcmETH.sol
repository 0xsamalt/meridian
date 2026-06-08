// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Native restaking wrapper on Mantle. Verify exact ABI on mantlescan before mainnet.
interface IcmETH {
    function deposit(uint256 methAmount, address receiver) external returns (uint256 cmethOut);
    function redeem(uint256 cmethAmount, address receiver, address owner) external returns (uint256 methOut);
    function convertToAssets(uint256 cmethAmount) external view returns (uint256 methValue);
}

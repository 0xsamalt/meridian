// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStrategy {
    function deploy(uint256 amountMeth) external;
    function withdraw(uint256 amountMeth) external returns (uint256 returnedMeth);
    function withdrawAll() external returns (uint256 returnedMeth);
    function getBalance() external view returns (uint256 methValue);
    function getCurrentAPY() external view returns (uint256 bps);
    function harvest() external returns (uint256 harvestedMeth);
    function asset() external view returns (address);
    function vault() external view returns (address);
}

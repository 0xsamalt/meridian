// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mock aWETH token minted 1:1 by MockAavePool. Accrues yield linearly. TESTNET ONLY.
contract MockAToken is ERC20 {
    address public pool;
    uint256 public rate = 1e18;         // aToken per underlying (WAD)
    uint256 public lastAccrue;
    uint256 public apyBps = 300;        // 3% APY (representative Aave WETH rate)

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        pool = msg.sender;
        lastAccrue = block.timestamp;
    }

    modifier onlyPool() { require(msg.sender == pool, "only pool"); _; }

    function accrue() external {
        uint256 elapsed = block.timestamp - lastAccrue;
        if (elapsed == 0) return;
        rate += (rate * apyBps * elapsed) / (10_000 * 365 days);
        lastAccrue = block.timestamp;
    }

    function mint(address to, uint256 amount) external onlyPool { _mint(to, amount); }
    function burn(address from, uint256 amount) external onlyPool { _burn(from, amount); }

    function scaledBalanceOf(address user) external view returns (uint256) {
        return (balanceOf(user) * 1e18) / rate;
    }
}

/// @notice Mock Aave V3 pool. supply() mints aTokens 1:1. withdraw() burns them + returns WETH.
/// Also implements IAaveProtocolDataProvider.getReserveData for getCurrentAPY(). TESTNET ONLY.
contract MockAavePool {
    IERC20      public weth;
    MockAToken  public aToken;
    uint256     public mockLiquidityRate = 3e24; // ~3% APR in ray (1e27)

    constructor(address _weth) {
        weth   = IERC20(_weth);
        aToken = new MockAToken("Mock aWETH", "aWETH");
    }

    function supply(address, uint256 amount, address onBehalfOf, uint16) external {
        weth.transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        uint256 bal = aToken.balanceOf(msg.sender);
        if (amount == type(uint256).max) amount = bal;
        if (amount > bal) amount = bal;
        aToken.burn(msg.sender, amount);
        weth.transfer(to, amount);
        return amount;
    }

    // IAaveProtocolDataProvider.getReserveData — returns mockLiquidityRate in slot 5 (index 5)
    function getReserveData(address) external view returns (
        uint256, uint256, uint256, uint256, uint256,
        uint256 liquidityRate,
        uint256, uint256, uint256, uint256, uint256, uint40
    ) {
        return (0, 0, 0, 0, 0, mockLiquidityRate, 0, 0, 0, 0, 0, 0);
    }

    function setLiquidityRate(uint256 rate) external { mockLiquidityRate = rate; }
    function getAToken() external view returns (address) { return address(aToken); }
}

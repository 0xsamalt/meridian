// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

// 6-decimal USDC faucet. TESTNET ONLY.
contract MockUSDC is MockERC20 {
    constructor() MockERC20("Mock USDC", "USDC", 6) {}
}

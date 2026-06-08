// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockERC20} from "./MockERC20.sol";

// Standard 18-decimal WETH faucet. TESTNET ONLY.
contract MockWETH is MockERC20 {
    constructor() MockERC20("Mock WETH", "WETH", 18) {}
}

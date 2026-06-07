// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VaultCore} from "../src/VaultCore.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys VaultCore to Mantle Sepolia (mocks for strategies added in separate scripts).
contract Deploy is Script {
    // Mantle Sepolia — real testnet mETH
    address constant METH_SEPOLIA = 0x9EF6f9160Ba00B6621e5CB3217BB8b54a92B2828;

    function run() external {
        address deployer  = vm.envAddress("DEPLOYER_ADDRESS");
        address keeper    = vm.envAddress("KEEPER_ADDRESS");
        address guardian  = vm.envOr("GUARDIAN_MULTISIG", deployer);
        address admin     = vm.envOr("ADMIN_MULTISIG",    deployer);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        VaultCore vault = new VaultCore(
            IERC20(METH_SEPOLIA),
            admin,
            keeper,
            guardian
        );

        console.log("VaultCore deployed:", address(vault));

        vm.stopBroadcast();
    }
}

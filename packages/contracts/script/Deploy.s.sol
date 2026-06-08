// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {VaultCore}      from "../src/VaultCore.sol";
import {CmethStrategy}  from "../src/CmethStrategy.sol";
import {AaveStrategy}   from "../src/AaveStrategy.sol";

import {MockWETH}       from "../src/mocks/MockWETH.sol";
import {MockUSDC}       from "../src/mocks/MockUSDC.sol";
import {MockUSDY}       from "../src/mocks/MockUSDY.sol";
import {MockCmETH}      from "../src/mocks/MockCmETH.sol";
import {MockAavePool}   from "../src/mocks/MockAavePool.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";

/// @notice Full Meridian deployment for Mantle Sepolia.
/// Uses real testnet mETH; all other protocol addresses are mocks.
contract Deploy is Script {
    // Mantle Sepolia — verified testnet mETH address
    address constant METH_SEPOLIA = 0x9EF6f9160Ba00B6621e5CB3217BB8b54a92B2828;

    function run() external {
        address deployer    = vm.envAddress("DEPLOYER_ADDRESS");
        address keeper      = vm.envOr("KEEPER_ADDRESS",    deployer);
        address guardian    = vm.envOr("GUARDIAN_MULTISIG", deployer);
        address admin       = vm.envOr("ADMIN_MULTISIG",    deployer);

        // Private key comes from --private-key CLI flag; broadcast uses that sender.
        vm.startBroadcast();

        // ── 1. Mock tokens ────────────────────────────────────────────────
        MockWETH weth = new MockWETH();
        console.log("MockWETH:      ", address(weth));

        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC:      ", address(usdc));

        MockUSDY usdy = new MockUSDY(address(usdc));
        console.log("MockUSDY:      ", address(usdy));

        MockCmETH cmeth = new MockCmETH(METH_SEPOLIA);
        console.log("MockCmETH:     ", address(cmeth));

        // ── 2. Mock protocol contracts ────────────────────────────────────
        MockAavePool   aavePool   = new MockAavePool(address(weth));
        console.log("MockAavePool:  ", address(aavePool));

        MockSwapRouter swapRouter = new MockSwapRouter();
        console.log("MockSwapRouter:", address(swapRouter));

        // ── 3. Vault ──────────────────────────────────────────────────────
        // Deploy with deployer as admin so we can call addStrategy in this script.
        // After setup, also grant DEFAULT_ADMIN_ROLE to the configured admin address.
        VaultCore vault = new VaultCore(
            IERC20(METH_SEPOLIA),
            deployer,   // deployer starts as admin for this script
            keeper,
            guardian
        );
        console.log("VaultCore:     ", address(vault));

        // ── 4. Strategies ─────────────────────────────────────────────────
        CmethStrategy cmethStrategy = new CmethStrategy(
            address(vault),
            METH_SEPOLIA,
            address(cmeth)
        );
        console.log("CmethStrategy: ", address(cmethStrategy));

        AaveStrategy aaveStrategy = new AaveStrategy(
            address(vault),
            METH_SEPOLIA,
            address(weth),
            address(aavePool),
            address(swapRouter)
        );
        console.log("AaveStrategy:  ", address(aaveStrategy));

        // Seed 1:1 mock prices into AaveStrategy's PriceLib storage
        aaveStrategy.setMockPrice(METH_SEPOLIA, address(weth), 1e18);

        // ── 5. Register strategies in vault ───────────────────────────────
        vault.addStrategy(address(cmethStrategy), 6_000); // 60% cap
        vault.addStrategy(address(aaveStrategy),  6_000); // 60% cap

        // Grant the configured admin address full admin role (if different from deployer)
        if (admin != deployer) {
            vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), admin);
        }

        console.log("Strategies registered in vault.");

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────────────────
        console.log("");
        console.log("=== Deployment summary (Mantle Sepolia) ===");
        console.log("VaultCore:     ", address(vault));
        console.log("CmethStrategy: ", address(cmethStrategy));
        console.log("AaveStrategy:  ", address(aaveStrategy));
        console.log("MockCmETH:     ", address(cmeth));
        console.log("MockAavePool:  ", address(aavePool));
        console.log("MockSwapRouter:", address(swapRouter));
        console.log("MockWETH:      ", address(weth));
        console.log("MockUSDC:      ", address(usdc));
        console.log("MockUSDY:      ", address(usdy));
    }
}

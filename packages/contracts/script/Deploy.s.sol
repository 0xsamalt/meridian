// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {VaultCore}      from "../src/VaultCore.sol";
import {CmethStrategy}  from "../src/CmethStrategy.sol";
import {AaveStrategy}   from "../src/AaveStrategy.sol";
import {UsdyStrategy}   from "../src/UsdyStrategy.sol";

import {MockWETH}       from "../src/mocks/MockWETH.sol";
import {MockUSDC}       from "../src/mocks/MockUSDC.sol";
import {MockUSDY}       from "../src/mocks/MockUSDY.sol";
import {MockCmETH}      from "../src/mocks/MockCmETH.sol";
import {MockAavePool}   from "../src/mocks/MockAavePool.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";

/// @notice Full Meridian deployment for Mantle Sepolia.
/// Vault asset is MockWETH — a public-mint faucet token so anyone can deposit.
contract Deploy is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address keeper   = vm.envOr("KEEPER_ADDRESS",    deployer);
        address guardian = vm.envOr("GUARDIAN_MULTISIG", deployer);
        address admin    = vm.envOr("ADMIN_MULTISIG",    deployer);

        vm.startBroadcast();

        // ── 1. Mock tokens ────────────────────────────────────────────────
        MockWETH weth = new MockWETH();
        console.log("MockWETH:      ", address(weth));

        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC:      ", address(usdc));

        MockUSDY usdy = new MockUSDY(address(usdc));
        console.log("MockUSDY:      ", address(usdy));

        // MockCmETH wraps the same token as the vault asset (MockWETH)
        MockCmETH cmeth = new MockCmETH(address(weth));
        console.log("MockCmETH:     ", address(cmeth));

        // ── 2. Mock protocol contracts ────────────────────────────────────
        MockAavePool   aavePool   = new MockAavePool(address(weth));
        console.log("MockAavePool:  ", address(aavePool));

        MockSwapRouter swapRouter = new MockSwapRouter();
        console.log("MockSwapRouter:", address(swapRouter));

        // ── 3. Vault (asset = MockWETH) ───────────────────────────────────
        VaultCore vault = new VaultCore(
            IERC20(address(weth)),
            deployer,
            keeper,
            guardian
        );
        console.log("VaultCore:     ", address(vault));

        // ── 4. Strategies ─────────────────────────────────────────────────
        CmethStrategy cmethStrategy = new CmethStrategy(
            address(vault),
            address(weth),  // vault asset
            address(cmeth)
        );
        console.log("CmethStrategy: ", address(cmethStrategy));

        AaveStrategy aaveStrategy = new AaveStrategy(
            address(vault),
            address(weth),  // vault asset
            address(weth),  // WETH for Aave (same token on testnet)
            address(aavePool),
            address(swapRouter)
        );
        console.log("AaveStrategy:  ", address(aaveStrategy));

        UsdyStrategy usdyStrategy = new UsdyStrategy(
            address(vault),
            address(weth),  // vault asset
            address(usdc),
            address(usdy),
            address(swapRouter)
        );
        console.log("UsdyStrategy:  ", address(usdyStrategy));

        // Seed mock prices (1:1 wad ratio for all pairs on testnet)
        aaveStrategy.setMockPrice(address(weth), address(weth), 1e18);
        usdyStrategy.setMockPrice(address(weth), address(usdc), 1e18);

        // ── 5. Register strategies in vault ───────────────────────────────
        vault.addStrategy(address(cmethStrategy), 6_000); // 60% cap
        vault.addStrategy(address(aaveStrategy),  6_000); // 60% cap
        vault.addStrategy(address(usdyStrategy),  5_000); // 50% cap

        if (admin != deployer) {
            vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), admin);
        }

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────────────────
        console.log("");
        console.log("=== Deployment summary (Mantle Sepolia) ===");
        console.log("VaultCore:     ", address(vault));
        console.log("CmethStrategy: ", address(cmethStrategy));
        console.log("AaveStrategy:  ", address(aaveStrategy));
        console.log("UsdyStrategy:  ", address(usdyStrategy));
        console.log("MeridianRegistry: (unchanged)");
        console.log("MockWETH:      ", address(weth));
        console.log("MockCmETH:     ", address(cmeth));
        console.log("MockAavePool:  ", address(aavePool));
        console.log("MockSwapRouter:", address(swapRouter));
        console.log("MockUSDC:      ", address(usdc));
        console.log("MockUSDY:      ", address(usdy));
    }
}

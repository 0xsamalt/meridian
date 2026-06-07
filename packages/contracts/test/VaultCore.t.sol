// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {VaultCore} from "../src/VaultCore.sol";
import {IStrategy} from "../src/interfaces/IStrategy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ---------------------------------------------------------------------------
//  Minimal ERC-20 faucet (simulates mETH on testnet)
// ---------------------------------------------------------------------------
contract MockMETH is ERC20 {
    constructor() ERC20("Mock mETH", "mETH") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ---------------------------------------------------------------------------
//  Minimal strategy mock — holds mETH, reports balances, supports all calls
// ---------------------------------------------------------------------------
contract MockStrategy is IStrategy {
    address public immutable override asset;
    address public immutable override vault;
    uint256 internal _balance;

    constructor(address _asset, address _vault) {
        asset = _asset;
        vault = _vault;
    }

    function deploy(uint256 amount) external override {
        // mETH already transferred to this contract by the vault; record it
        _balance += amount;
    }

    function withdraw(uint256 amount) external override returns (uint256 returned) {
        if (amount > _balance) amount = _balance;
        _balance -= amount;
        IERC20(asset).transfer(vault, amount);
        return amount;
    }

    function withdrawAll() external override returns (uint256 returned) {
        returned = _balance;
        _balance = 0;
        if (returned > 0) IERC20(asset).transfer(vault, returned);
    }

    function getBalance() external view override returns (uint256) { return _balance; }
    function getCurrentAPY() external pure override returns (uint256) { return 350; }
    function harvest() external pure override returns (uint256) { return 0; }
}

// ---------------------------------------------------------------------------
//  VaultCore test suite
// ---------------------------------------------------------------------------
contract VaultCoreTest is Test {
    MockMETH   internal meth;
    VaultCore  internal vault;
    MockStrategy internal strategy;

    address internal admin    = makeAddr("admin");
    address internal keeper   = makeAddr("keeper");
    address internal guardian = makeAddr("guardian");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");

    uint256 internal constant DEPOSIT_AMOUNT = 10 ether;

    function setUp() public {
        // Deploy mock mETH and vault
        meth  = new MockMETH();
        vault = new VaultCore(IERC20(address(meth)), admin, keeper, guardian);

        // Deploy mock strategy
        strategy = new MockStrategy(address(meth), address(vault));

        // Admin adds strategy with 60% cap
        vm.prank(admin);
        vault.addStrategy(address(strategy), 6_000);

        // Fund alice and bob
        meth.mint(alice, 100 ether);
        meth.mint(bob, 100 ether);

        // Alice approves vault
        vm.prank(alice);
        meth.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        meth.approve(address(vault), type(uint256).max);
    }

    // -----------------------------------------------------------------------
    //  testDeposit — deposit mints shares proportional to assets
    // -----------------------------------------------------------------------
    function testDeposit() public {
        // Arrange
        uint256 aliceBalBefore = meth.balanceOf(alice);

        // Act
        vm.prank(alice);
        uint256 shares = vault.deposit(DEPOSIT_AMOUNT, alice);

        // Assert
        assertGt(shares, 0, "should mint non-zero shares");
        assertEq(vault.balanceOf(alice), shares, "alice share balance mismatch");
        assertEq(meth.balanceOf(alice), aliceBalBefore - DEPOSIT_AMOUNT, "mETH not pulled from alice");
        assertEq(vault.totalAssets(), DEPOSIT_AMOUNT, "totalAssets should equal deposit");
    }

    // -----------------------------------------------------------------------
    //  testWithdraw — withdraw returns mETH proportional to shares redeemed
    // -----------------------------------------------------------------------
    function testWithdraw() public {
        // Arrange — alice deposits first
        vm.prank(alice);
        vault.deposit(DEPOSIT_AMOUNT, alice);

        uint256 aliceSharesBefore = vault.balanceOf(alice);
        uint256 aliceMethBefore   = meth.balanceOf(alice);

        // Act — withdraw half the deposit
        uint256 withdrawAmount = DEPOSIT_AMOUNT / 2;
        vm.prank(alice);
        uint256 sharesUsed = vault.withdraw(withdrawAmount, alice, alice);

        // Assert
        assertGt(sharesUsed, 0, "should burn non-zero shares");
        assertLt(vault.balanceOf(alice), aliceSharesBefore, "alice shares should decrease");
        assertEq(meth.balanceOf(alice), aliceMethBefore + withdrawAmount, "alice should receive mETH back");
        assertEq(vault.totalAssets(), DEPOSIT_AMOUNT - withdrawAmount, "totalAssets should drop by withdrawn amount");
    }

    // -----------------------------------------------------------------------
    //  testCooldown — second rebalance within cooldown window must revert
    // -----------------------------------------------------------------------
    function testCooldown() public {
        // Arrange — alice deposits so TVL > 0
        vm.prank(alice);
        vault.deposit(DEPOSIT_AMOUNT, alice);

        // Foundry starts block.timestamp at 1; warp past the initial cooldown so
        // the first rebalance (lastRebalance == 0) is not itself blocked.
        vm.warp(vault.cooldown() + 1);

        address[] memory strats  = new address[](1);
        uint256[] memory bpsArr  = new uint256[](1);
        strats[0] = address(strategy);
        bpsArr[0] = 5_000; // 50%
        bytes32 hash = keccak256("reasoning-v1");

        // First rebalance should succeed
        vm.startPrank(keeper);
        vault.rebalance(strats, bpsArr, hash);

        // Second rebalance immediately should revert with CooldownActive
        uint256 readyAt = block.timestamp + vault.cooldown();
        vm.expectRevert(abi.encodeWithSelector(VaultCore.CooldownActive.selector, readyAt));
        vault.rebalance(strats, bpsArr, hash);
        vm.stopPrank();

        // After cooldown elapses it should succeed again
        vm.warp(readyAt);
        vm.prank(keeper);
        vault.rebalance(strats, bpsArr, hash);
    }

    // -----------------------------------------------------------------------
    //  testPauseBlocksDeposit — deposit reverts when paused; withdraw still works
    // -----------------------------------------------------------------------
    function testPauseBlocksDeposit() public {
        // Arrange — alice deposits before pause
        vm.prank(alice);
        vault.deposit(DEPOSIT_AMOUNT, alice);

        // Guardian pauses vault (without pulling funds)
        vm.prank(guardian);
        vault.emergencyPause(false);

        // Deposit should now revert
        vm.prank(bob);
        vm.expectRevert();
        vault.deposit(DEPOSIT_AMOUNT, bob);

        // Withdraw should still work even while paused
        uint256 aliceShares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 assetsOut = vault.redeem(aliceShares, alice, alice);

        assertGt(assetsOut, 0, "alice should receive mETH on withdraw even when paused");
        assertEq(vault.balanceOf(alice), 0, "alice shares should be zero after full redeem");
    }
}

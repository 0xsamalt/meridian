// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CmethStrategy} from "../src/CmethStrategy.sol";

// ---------------------------------------------------------------------------
//  MockMETH — standard 18-decimal faucet token
// ---------------------------------------------------------------------------
contract MockMETHCmeth is ERC20 {
    constructor() ERC20("Mock mETH", "mETH") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ---------------------------------------------------------------------------
//  MockCmETH — simple 1:1 rate ERC-20 for unit tests
// ---------------------------------------------------------------------------
contract MockCmETH is ERC20 {
    IERC20 public meth;
    uint256 public rate = 1e18; // 1 cmETH = 1 mETH initially

    constructor(address _meth) ERC20("Mock cmETH", "mcmETH") {
        meth = IERC20(_meth);
    }

    function deposit(uint256 methAmount, address receiver) external returns (uint256 cmethOut) {
        meth.transferFrom(msg.sender, address(this), methAmount);
        cmethOut = (methAmount * 1e18) / rate;
        _mint(receiver, cmethOut);
    }

    function redeem(uint256 cmethAmount, address receiver, address from) external returns (uint256 methOut) {
        _burn(from, cmethAmount);
        methOut = (cmethAmount * rate) / 1e18;
        meth.transfer(receiver, methOut);
    }

    function convertToAssets(uint256 cmethAmount) external view returns (uint256) {
        return (cmethAmount * rate) / 1e18;
    }

    // Test helper: set exchange rate to simulate yield accrual
    function setRate(uint256 newRate) external { rate = newRate; }
}

// ---------------------------------------------------------------------------
//  CmethStrategy tests
// ---------------------------------------------------------------------------
contract CmethStrategyTest is Test {
    MockMETHCmeth internal meth;
    MockCmETH     internal cmeth;
    CmethStrategy internal strategy;

    address internal vault   = makeAddr("vault");
    address internal owner   = makeAddr("owner");
    address internal alice   = makeAddr("alice");

    uint256 constant AMOUNT = 10 ether;

    function setUp() public {
        meth  = new MockMETHCmeth();
        cmeth = new MockCmETH(address(meth));

        vm.prank(owner);
        strategy = new CmethStrategy(vault, address(meth), address(cmeth));

        // Fund vault with mETH and approve strategy
        meth.mint(vault, 100 ether);
        vm.prank(vault);
        meth.approve(address(strategy), type(uint256).max);

        // Fund cmeth contract with mETH so it can pay out on redeem
        meth.mint(address(cmeth), 100 ether);
    }

    // -----------------------------------------------------------------------
    //  testDeploy — vault transfers mETH to strategy, which deposits into cmETH
    // -----------------------------------------------------------------------
    function testDeploy() public {
        // Arrange
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);

        // Act
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        // Assert
        assertGt(IERC20(address(cmeth)).balanceOf(address(strategy)), 0, "should hold cmETH");
        assertGt(strategy.getBalance(), 0, "getBalance should be non-zero");
    }

    // -----------------------------------------------------------------------
    //  testWithdraw — strategy redeems cmETH, vault receives mETH
    // -----------------------------------------------------------------------
    function testWithdraw() public {
        // Arrange — deploy first
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        uint256 vaultMethBefore = meth.balanceOf(vault);

        // Act — withdraw half
        vm.prank(vault);
        uint256 returned = strategy.withdraw(AMOUNT / 2);

        // Assert
        assertGt(returned, 0, "should return non-zero mETH");
        assertGt(meth.balanceOf(vault), vaultMethBefore, "vault should receive mETH");
    }

    // -----------------------------------------------------------------------
    //  testGetBalance — getBalance reflects current cmETH value in mETH
    // -----------------------------------------------------------------------
    function testGetBalance() public {
        // Arrange — deploy
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        // Balance should equal deposit at 1:1 rate
        assertApproxEqAbs(strategy.getBalance(), AMOUNT, 1, "balance should ~= deposit at 1:1 rate");

        // Simulate yield: rate increases to 1.1x
        cmeth.setRate(1.1e18);
        assertApproxEqAbs(strategy.getBalance(), AMOUNT * 11 / 10, 1, "balance should grow with rate");
    }

    // -----------------------------------------------------------------------
    //  testWithdrawAll — strategy returns all cmETH as mETH to vault
    // -----------------------------------------------------------------------
    function testWithdrawAll() public {
        // Arrange — deploy
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        uint256 vaultMethBefore = meth.balanceOf(vault);

        // Act
        vm.prank(vault);
        uint256 returned = strategy.withdrawAll();

        // Assert
        assertGt(returned, 0, "should return non-zero mETH");
        assertEq(strategy.getBalance(), 0, "balance should be zero after withdrawAll");
        assertGt(meth.balanceOf(vault), vaultMethBefore, "vault should receive mETH");
    }
}

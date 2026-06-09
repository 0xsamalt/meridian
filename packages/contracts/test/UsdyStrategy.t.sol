// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {UsdyStrategy} from "../src/UsdyStrategy.sol";
import {PriceLib} from "../src/lib/PriceLib.sol";
import {IAgniSwapRouter} from "../src/interfaces/IAgniSwapRouter.sol";

// ---------------------------------------------------------------------------
//  Test tokens
// ---------------------------------------------------------------------------
contract MockMETHUsdy is ERC20 {
    constructor() ERC20("Mock mETH", "mETH") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// 18-decimal test USDC (keeps router 1:1 math consistent with PriceLib WAD prices)
contract MockUSDCUsdy is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// Simple USDY mock: 1 USDY = 1e18 USDC (18-dec) initially; rate accrues at 5% APY
contract MockUSDYUsdy is ERC20 {
    IERC20  public usdc;
    uint256 public rate = 1e18;      // USDC (18-dec) per USDY (18-dec)
    uint256 public lastAccrue;
    uint256 public apyBps = 500;     // 5% APY

    constructor(address _usdc) ERC20("Mock USDY", "USDY") {
        usdc = IERC20(_usdc);
        lastAccrue = block.timestamp;
    }

    function _accrue() internal {
        uint256 elapsed = block.timestamp - lastAccrue;
        if (elapsed == 0) return;
        rate += (rate * apyBps * elapsed) / (10_000 * 365 days);
        lastAccrue = block.timestamp;
    }

    function deposit(uint256 usdcAmount, address receiver) external returns (uint256 usdyOut) {
        _accrue();
        usdc.transferFrom(msg.sender, address(this), usdcAmount);
        usdyOut = (usdcAmount * 1e18) / rate;
        _mint(receiver, usdyOut);
    }

    function redeem(uint256 usdyAmount, address receiver) external returns (uint256 usdcOut) {
        _accrue();
        _burn(msg.sender, usdyAmount);
        usdcOut = (usdyAmount * rate) / 1e18;
        usdc.transfer(receiver, usdcOut);
    }

    function convertToUSDC(uint256 usdyAmount) external view returns (uint256) {
        uint256 elapsed = block.timestamp - lastAccrue;
        uint256 currentRate = rate + (rate * apyBps * elapsed) / (10_000 * 365 days);
        return (usdyAmount * currentRate) / 1e18;
    }

    function setRate(uint256 newRate) external { rate = newRate; }
}

// MockSwapRouter: mints tokenOut at 1:1 to recipient
contract MockSwapRouterUsdy {
    uint256 public rateBps = 10_000;

    function exactInputSingle(IAgniSwapRouter.ExactInputSingleParams calldata p)
        external returns (uint256 amountOut)
    {
        amountOut = (p.amountIn * rateBps) / 10_000;
        require(amountOut >= p.amountOutMinimum, "MockSwapRouter: slippage exceeded");
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        IMintable(p.tokenOut).mint(p.recipient, amountOut);
    }

    function setRate(uint256 bps) external { rateBps = bps; }
}

interface IMintable { function mint(address to, uint256 amount) external; }

// ---------------------------------------------------------------------------
//  UsdyStrategy tests
// ---------------------------------------------------------------------------
contract UsdyStrategyTest is Test {
    MockMETHUsdy        internal meth;
    MockUSDCUsdy        internal usdc;
    MockUSDYUsdy        internal usdy;
    MockSwapRouterUsdy  internal router;
    UsdyStrategy        internal strategy;

    address internal vault = makeAddr("vault");
    address internal owner = makeAddr("owner");

    // 10 mETH
    uint256 constant AMOUNT = 10 ether;

    function setUp() public {
        meth   = new MockMETHUsdy();
        usdc   = new MockUSDCUsdy();
        usdy   = new MockUSDYUsdy(address(usdc));
        router = new MockSwapRouterUsdy();

        vm.prank(owner);
        strategy = new UsdyStrategy(vault, address(meth), address(usdc), address(usdy), address(router));

        // Both tokens 18-dec: 1 mETH = 1 USDC (WAD 1:1), router also 1:1 raw → no decimal skew
        vm.prank(owner);
        strategy.setMockPrice(address(meth), address(usdc), 1e18);

        // Fund vault and give strategy approval
        meth.mint(vault, 100 ether);
        vm.prank(vault);
        meth.approve(address(strategy), type(uint256).max);

        // Fund MockUSDY with USDC reserves so it can pay out on redeem
        usdc.mint(address(usdy), 1_000_000 ether);
    }

    // -----------------------------------------------------------------------
    //  testDeploy — mETH → USDC → USDY
    // -----------------------------------------------------------------------
    function testDeploy() public {
        // Arrange
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);

        // Act
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        // Assert: strategy holds USDY
        assertGt(IERC20(address(usdy)).balanceOf(address(strategy)), 0, "strategy should hold USDY");
        assertGt(strategy.getBalance(), 0, "getBalance should be non-zero after deploy");
    }

    // -----------------------------------------------------------------------
    //  testWithdraw — USDY → USDC → mETH
    // -----------------------------------------------------------------------
    function testWithdraw() public {
        // Arrange
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
        assertGt(meth.balanceOf(vault), vaultMethBefore, "vault mETH should increase");
    }

    // -----------------------------------------------------------------------
    //  testGetBalance — correct mETH value after deploy and after yield accrual
    // -----------------------------------------------------------------------
    function testGetBalance() public {
        assertEq(strategy.getBalance(), 0, "initial balance should be zero");

        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        // At 1:1 rate, 10 mETH → 10 USDC → USDY → back to ~10 mETH via quotes
        assertApproxEqAbs(strategy.getBalance(), AMOUNT, 1, "balance should ~= 10 mETH at 1:1");

        // Warp 30 days — USDY accrues yield so getBalance grows
        vm.warp(block.timestamp + 30 days);
        assertGt(strategy.getBalance(), AMOUNT, "balance should grow after 30 days yield");
    }

    // -----------------------------------------------------------------------
    //  testWithdrawAll — full position unwound
    // -----------------------------------------------------------------------
    function testWithdrawAll() public {
        // Arrange
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
        assertEq(IERC20(address(usdy)).balanceOf(address(strategy)), 0, "USDY balance should be zero");
        assertEq(strategy.getBalance(), 0, "getBalance should be zero after withdrawAll");
        assertGt(meth.balanceOf(vault), vaultMethBefore, "vault should receive mETH");
    }
}

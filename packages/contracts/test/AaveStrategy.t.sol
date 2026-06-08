// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AaveStrategy} from "../src/AaveStrategy.sol";
import {PriceLib} from "../src/lib/PriceLib.sol";
import {IAgniSwapRouter} from "../src/interfaces/IAgniSwapRouter.sol";

// ---------------------------------------------------------------------------
//  MockMETH
// ---------------------------------------------------------------------------
contract MockMETHAave is ERC20 {
    constructor() ERC20("Mock mETH", "mETH") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ---------------------------------------------------------------------------
//  MockWETH
// ---------------------------------------------------------------------------
contract MockWETHAave is ERC20 {
    constructor() ERC20("Mock WETH", "WETH") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ---------------------------------------------------------------------------
//  MockAavePool — implements IAaveV3Pool + IAaveProtocolDataProvider
// ---------------------------------------------------------------------------
contract MockAavePool {
    mapping(address => uint256) public userBalance; // user → WETH deposited
    uint256 public mockLiquidityRate = 3e24; // 3% APR in ray units (3e24 / 1e23 = 30 bps)
    IERC20 public weth;

    constructor(address _weth) { weth = IERC20(_weth); }

    function supply(address, uint256 amount, address onBehalfOf, uint16) external {
        weth.transferFrom(msg.sender, address(this), amount);
        userBalance[onBehalfOf] += amount;
    }

    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        uint256 bal = userBalance[msg.sender];
        if (amount == type(uint256).max) amount = bal;
        if (amount > bal) amount = bal;
        userBalance[msg.sender] -= amount;
        weth.transfer(to, amount);
        return amount;
    }

    function getReserveData(address) external view returns (
        uint256, uint256, uint256, uint256, uint256,
        uint256 liquidityRate,
        uint256, uint256, uint256, uint256, uint256, uint40
    ) {
        return (0, 0, 0, 0, 0, mockLiquidityRate, 0, 0, 0, 0, 0, 0);
    }

    function setLiquidityRate(uint256 rate) external { mockLiquidityRate = rate; }
}

// ---------------------------------------------------------------------------
//  MockSwapRouter — fixed 1:1 rate (admin-configurable)
// ---------------------------------------------------------------------------
contract MockSwapRouter {
    uint256 public rateBps = 10_000; // 10000 = 1:1; can set < 10000 to test slippage

    mapping(address => mapping(address => uint256)) public mockAmountOut;
    bool public useFixedOut;
    uint256 public fixedOut;

    function exactInputSingle(IAgniSwapRouter.ExactInputSingleParams calldata p)
        external returns (uint256 amountOut)
    {
        if (useFixedOut) {
            amountOut = fixedOut;
        } else {
            amountOut = (p.amountIn * rateBps) / 10_000;
        }
        require(amountOut >= p.amountOutMinimum, "MockSwapRouter: insufficient output");
        // Transfer tokenOut to recipient (mint from router balance)
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        MockMintable(p.tokenOut).mint(p.recipient, amountOut);
    }

    function setRate(uint256 bps) external { rateBps = bps; useFixedOut = false; }
    function setFixedOut(uint256 amount) external { fixedOut = amount; useFixedOut = true; }
}

// Minimal mintable interface for MockSwapRouter
interface MockMintable {
    function mint(address to, uint256 amount) external;
}

// ---------------------------------------------------------------------------
//  AaveStrategy tests
// ---------------------------------------------------------------------------
contract AaveStrategyTest is Test {
    MockMETHAave    internal meth;
    MockWETHAave    internal weth;
    MockAavePool    internal aavePool;
    MockSwapRouter  internal swapRouter;
    AaveStrategy    internal strategy;

    address internal vault = makeAddr("vault");
    address internal owner = makeAddr("owner");

    uint256 constant AMOUNT = 10 ether;

    function setUp() public {
        meth       = new MockMETHAave();
        weth       = new MockWETHAave();
        aavePool   = new MockAavePool(address(weth));
        swapRouter = new MockSwapRouter();

        vm.prank(owner);
        strategy = new AaveStrategy(vault, address(meth), address(weth), address(aavePool), address(swapRouter));

        // Wire prices into strategy's PriceLib storage (1 mETH = 1 WETH)
        vm.prank(owner);
        strategy.setMockPrice(address(meth), address(weth), 1e18);

        // Approvals
        meth.mint(vault, 100 ether);
        vm.prank(vault);
        meth.approve(address(strategy), type(uint256).max);

        // Fund router so it can pay out on swaps
        weth.mint(address(swapRouter), 1000 ether);
        meth.mint(address(swapRouter), 1000 ether);
        weth.mint(address(aavePool), 1000 ether);
    }

    // -----------------------------------------------------------------------
    //  testDeploy — strategy swaps mETH→WETH, supplies to Aave
    // -----------------------------------------------------------------------
    function testDeploy() public {
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        // aavePool should hold WETH
        assertGt(weth.balanceOf(address(aavePool)), 0, "pool should hold WETH");
        // strategy balance should be nonzero
        assertGt(strategy.getBalance(), 0, "getBalance should be non-zero after deploy");
    }

    // -----------------------------------------------------------------------
    //  testWithdraw — strategy redeems from Aave, swaps WETH→mETH, sends to vault
    // -----------------------------------------------------------------------
    function testWithdraw() public {
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        uint256 vaultMethBefore = meth.balanceOf(vault);

        vm.prank(vault);
        uint256 returned = strategy.withdraw(AMOUNT / 2);

        assertGt(returned, 0, "should return non-zero mETH");
        assertGt(meth.balanceOf(vault), vaultMethBefore, "vault mETH should increase");
    }

    // -----------------------------------------------------------------------
    //  testGetBalance — balance reflects deployed WETH in mETH terms
    // -----------------------------------------------------------------------
    function testGetBalance() public {
        assertEq(strategy.getBalance(), 0, "initial balance should be zero");

        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);
        vm.prank(vault);
        strategy.deploy(AMOUNT);

        assertApproxEqAbs(strategy.getBalance(), AMOUNT, 1, "balance should ~= amount deployed at 1:1 rate");
    }

    // -----------------------------------------------------------------------
    //  testGetCurrentAPY — reads liquidityRate from mock pool, converts to bps
    // -----------------------------------------------------------------------
    function testGetCurrentAPY() public view {
        uint256 apy = strategy.getCurrentAPY();
        // mockLiquidityRate = 3e24 → 3e24 / 1e23 = 30 bps
        assertEq(apy, 30, "APY should be 30 bps at mock rate 3e24");
    }

    // -----------------------------------------------------------------------
    //  testSlippageProtection — reverts if router returns less than minOut
    // -----------------------------------------------------------------------
    function testSlippageProtection() public {
        vm.prank(vault);
        meth.transfer(address(strategy), AMOUNT);

        // Set router to return almost nothing (0.5% of input), well below 1% slippage tolerance
        swapRouter.setFixedOut(AMOUNT / 200); // 0.5% of input

        vm.prank(vault);
        vm.expectRevert("MockSwapRouter: insufficient output");
        strategy.deploy(AMOUNT);
    }
}

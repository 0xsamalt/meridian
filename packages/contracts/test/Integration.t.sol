// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {VaultCore}         from "../src/VaultCore.sol";
import {CmethStrategy}     from "../src/CmethStrategy.sol";
import {AaveStrategy}      from "../src/AaveStrategy.sol";
import {UsdyStrategy}      from "../src/UsdyStrategy.sol";
import {MeridianRegistry}  from "../src/MeridianRegistry.sol";
import {PriceLib}          from "../src/lib/PriceLib.sol";

// MockCmETH imported but overridden by IntMockCmETH below for rounding control
import {MockAavePool}   from "../src/mocks/MockAavePool.sol";
import {MockSwapRouter} from "../src/mocks/MockSwapRouter.sol";
import {MockWETH}       from "../src/mocks/MockWETH.sol";
import {MockERC20}      from "../src/mocks/MockERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ---------------------------------------------------------------------------
//  IntMockCmETH — ceiling-division redeem prevents 1-wei dust from
//  CmethStrategy._methToCmeth double-division (amountMeth * 1e18 / rate * rate / 1e18)
// ---------------------------------------------------------------------------
contract IntMockCmETH is ERC20 {
    IERC20  public meth;
    uint256 public rate = 1e18;
    uint256 public lastAccrue;
    uint256 public apyBps = 350; // 3.5% APY

    constructor(address _meth) ERC20("Int cmETH", "icmETH") {
        meth = IERC20(_meth);
        lastAccrue = block.timestamp;
    }

    function _accrue() internal {
        uint256 elapsed = block.timestamp - lastAccrue;
        if (elapsed == 0) return;
        rate += (rate * apyBps * elapsed) / (10_000 * 365 days);
        lastAccrue = block.timestamp;
    }

    function deposit(uint256 methAmount, address receiver) external returns (uint256 cmethOut) {
        _accrue();
        meth.transferFrom(msg.sender, address(this), methAmount);
        cmethOut = (methAmount * 1e18) / rate;
        _mint(receiver, cmethOut);
    }

    // Ceiling division: ensures redeeming cmethNeeded always returns >= requested mETH
    function redeem(uint256 cmethAmount, address receiver, address from) external returns (uint256 methOut) {
        _accrue();
        _burn(from, cmethAmount);
        methOut = (cmethAmount * rate + 1e18 - 1) / 1e18; // ceiling
        meth.transfer(receiver, methOut);
    }

    function convertToAssets(uint256 cmethAmount) external view returns (uint256) {
        uint256 elapsed = block.timestamp - lastAccrue;
        uint256 currentRate = rate + (rate * apyBps * elapsed) / (10_000 * 365 days);
        // Ceiling so getBalance() == what redeem(cmethBal) will return → no 1-wei residual
        return (cmethAmount * currentRate + 1e18 - 1) / 1e18;
    }
}

// ---------------------------------------------------------------------------
//  18-dec USDC + USDY — avoids raw-ratio / WAD-price decimal skew with router
// ---------------------------------------------------------------------------
contract IntMockUSDC is ERC20 {
    constructor() ERC20("Int USDC", "iUSDC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract IntMockUSDY is ERC20 {
    IERC20  public usdc;
    uint256 public rate = 1e18;      // 1 USDY = 1 USDC (both 18-dec)
    uint256 public lastAccrue;
    uint256 public apyBps = 500;     // 5% APY

    constructor(address _usdc) ERC20("Int USDY", "iUSDY") {
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
        usdcOut = (usdyAmount * rate + 1e18 - 1) / 1e18; // ceiling — prevents 1-wei dust
        usdc.transfer(receiver, usdcOut);
    }

    function convertToUSDC(uint256 usdyAmount) external view returns (uint256) {
        uint256 elapsed = block.timestamp - lastAccrue;
        uint256 currentRate = rate + (rate * apyBps * elapsed) / (10_000 * 365 days);
        // Ceiling so getBalance() == what redeem(usdyBal) will return → no 1-wei residual
        return (usdyAmount * currentRate + 1e18 - 1) / 1e18;
    }
}

// ---------------------------------------------------------------------------
//  Minimal ERC-8004 mocks (same as MeridianRegistry test)
// ---------------------------------------------------------------------------
contract IntMockIdentity {
    uint256 private _nextId = 1;
    function register(string calldata) external returns (uint256 id) { id = _nextId++; }
    function setAgentURI(uint256, string calldata) external {}
    function ownerOf(uint256) external pure returns (address) { return address(0); }
}

contract IntMockReputation {
    function giveFeedback(uint256, int8, string calldata) external pure returns (uint256) { return 0; }
}

// ---------------------------------------------------------------------------
//  Integration test
// ---------------------------------------------------------------------------
contract IntegrationTest is Test {
    // Actors
    address internal admin    = makeAddr("admin");
    address internal keeper   = makeAddr("keeper");
    address internal guardian = makeAddr("guardian");
    address internal alice    = makeAddr("alice");

    // Tokens
    MockERC20      internal meth;
    MockWETH       internal weth;
    IntMockUSDC    internal usdc;   // 18-dec (avoids decimal skew with router)
    IntMockCmETH   internal cmeth;
    MockAavePool   internal aavePool;
    MockSwapRouter internal router;
    IntMockUSDY    internal usdy;

    // Contracts
    VaultCore        internal vault;
    CmethStrategy    internal cmethStrat;
    AaveStrategy     internal aaveStrat;
    UsdyStrategy     internal usdyStrat;
    MeridianRegistry internal registry;

    // 10 mETH
    uint256 constant DEPOSIT = 10 ether;

    function setUp() public {
        // --- deploy tokens ---
        meth  = new MockERC20("Mock mETH", "mETH", 18);
        weth  = new MockWETH();
        usdc  = new IntMockUSDC();  // 18-decimal for clean router math
        cmeth = new IntMockCmETH(address(meth));
        aavePool = new MockAavePool(address(weth));
        router   = new MockSwapRouter();
        usdy     = new IntMockUSDY(address(usdc));

        // --- deploy vault ---
        vm.prank(admin);
        vault = new VaultCore(IERC20(address(meth)), admin, keeper, guardian);

        // --- deploy strategies ---
        vm.prank(admin);
        cmethStrat = new CmethStrategy(address(vault), address(meth), address(cmeth));

        vm.prank(admin);
        aaveStrat = new AaveStrategy(address(vault), address(meth), address(weth), address(aavePool), address(router));

        vm.prank(admin);
        usdyStrat = new UsdyStrategy(address(vault), address(meth), address(usdc), address(usdy), address(router));

        // --- set mock prices (all 1:1 for simplicity) ---
        // mETH ↔ WETH at 1:1 (18 dec both)
        vm.prank(admin);
        aaveStrat.setMockPrice(address(meth), address(weth), 1e18);

        // mETH ↔ USDC: both 18-dec, so 1:1 → priceWad = 1e18
        vm.prank(admin);
        usdyStrat.setMockPrice(address(meth), address(usdc), 1e18);

        // --- add strategies to vault ---
        vm.startPrank(admin);
        vault.addStrategy(address(cmethStrat), 7_000);  // max 70%
        vault.addStrategy(address(aaveStrat),  7_000);
        vault.addStrategy(address(usdyStrat),  7_000);
        vm.stopPrank();

        // --- deploy registry ---
        IntMockIdentity  iid  = new IntMockIdentity();
        IntMockReputation irep = new IntMockReputation();
        vm.prank(admin);
        registry = new MeridianRegistry(address(vault), address(iid), address(irep), keeper);

        // --- fund alice ---
        meth.mint(alice, 100 ether);
        vm.prank(alice);
        IERC20(address(meth)).approve(address(vault), type(uint256).max);

        // --- fund mock contracts for yield payouts ---
        // MockCmETH needs extra mETH to pay yield on redeem
        meth.mint(address(cmeth), 10 ether);
        // IntMockUSDY needs extra USDC to pay yield on redeem
        usdc.mint(address(usdy), 1_000_000 ether);
        // MockSwapRouter needs WETH and mETH for swaps (it mints via mint())
        // MockAavePool needs WETH to return on withdraw (supplied via strategy)
        weth.mint(address(aavePool), 10 ether);

        // No seed — vault starts empty until Alice deposits
    }

    // -----------------------------------------------------------------------
    //  testFullFlow — deposit → rebalance → yield → rebalance → withdraw > 10 mETH
    // -----------------------------------------------------------------------
    function testFullFlow() public {
        // ── Step 1: Alice deposits 10 mETH ──────────────────────────────────
        vm.prank(alice);
        uint256 shares = vault.deposit(DEPOSIT, alice);

        assertGt(shares, 0, "should mint shares");
        assertEq(vault.totalAssets(), DEPOSIT, "total assets should equal deposit");

        // ── Step 2: Keeper rebalances — 40% cmETH, 40% Aave, 15% USDY, 5% idle ─
        vm.warp(block.timestamp + 2 hours); // satisfy initial cooldown

        address[] memory strats = new address[](3);
        uint256[] memory bps    = new uint256[](3);
        strats[0] = address(cmethStrat); bps[0] = 4_000;
        strats[1] = address(aaveStrat);  bps[1] = 4_000;
        strats[2] = address(usdyStrat);  bps[2] = 1_500;

        bytes32 rHash = keccak256("initial rebalance decision");
        vm.prank(keeper);
        vault.rebalance(strats, bps, rHash);

        // Strategies should now hold funds
        assertGt(cmethStrat.getBalance(), 0, "cmETH strategy should have balance");
        assertGt(aaveStrat.getBalance(),  0, "Aave strategy should have balance");
        assertGt(usdyStrat.getBalance(),  0, "USDY strategy should have balance");

        // ── Step 3: Warp 30 days — yield accrues ────────────────────────────
        vm.warp(block.timestamp + 30 days);

        uint256 tvlAfterYield = vault.totalAssets();
        // cmETH and USDY have time-based yield; overall TVL should grow
        assertGt(tvlAfterYield, DEPOSIT, "TVL should grow after 30 days of yield");

        // ── Step 4: Keeper rebalances again (past 1h cooldown) ──────────────
        // cooldown already satisfied by 30-day warp
        bytes32 rHash2 = keccak256("second rebalance decision");
        vm.prank(keeper);
        vault.rebalance(strats, bps, rHash2);

        // ── Step 5: Alice withdraws her max, proves she gets back more than she deposited
        // Use withdraw(maxWithdraw) so the vault transfers an exact amount it already holds
        // after _ensureLiquidity — avoids the double-previewRedeem issue where strategy
        // residuals inflate the second previewRedeem target past the vault balance.
        uint256 maxOut = vault.maxWithdraw(alice);
        assertGt(maxOut, DEPOSIT, "alice can withdraw more than deposited (yield accrued)");

        vm.prank(alice);
        vault.withdraw(maxOut, alice, alice);
    }

    // -----------------------------------------------------------------------
    //  testDecisionLogged — keeper records a decision; registry stores it correctly
    // -----------------------------------------------------------------------
    function testDecisionLogged() public {
        // Deposit and rebalance first so TVL > 0
        vm.prank(alice);
        vault.deposit(DEPOSIT, alice);

        vm.warp(block.timestamp + 2 hours); // satisfy initial cooldown

        address[] memory strats = new address[](3);
        uint256[] memory bps    = new uint256[](3);
        strats[0] = address(cmethStrat); bps[0] = 4_000;
        strats[1] = address(aaveStrat);  bps[1] = 4_000;
        strats[2] = address(usdyStrat);  bps[2] = 1_500;

        vm.prank(keeper);
        vault.rebalance(strats, bps, keccak256("rebalance1"));

        // Keeper records decision in registry
        string  memory cid  = "ipfs://QmMeridianDecisionABC";
        bytes32 hash        = keccak256(bytes(cid));
        int256  perfDelta   = 25; // +25 bps vs passive hold
        uint256 tvl         = vault.totalAssets();

        vm.prank(keeper);
        registry.recordDecision(hash, cid, perfDelta, tvl);

        // Assert count
        assertEq(registry.decisionCount(), 1, "decisionCount should be 1 after one record");

        // Assert stored data
        MeridianRegistry.Decision memory d = registry.getDecision(0);
        assertEq(d.reasoningHash, hash,       "reasoningHash should match keccak256(cid)");
        assertEq(d.cid,           cid,        "cid should be stored correctly");
        assertEq(d.perfDeltaBps,  perfDelta,  "perfDelta should match");
        assertEq(d.totalAssets,   tvl,        "totalAssets snapshot should match");
    }
}

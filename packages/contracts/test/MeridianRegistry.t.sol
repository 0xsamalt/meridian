// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MeridianRegistry} from "../src/MeridianRegistry.sol";

// ---------------------------------------------------------------------------
//  Minimal ERC-8004 mocks
// ---------------------------------------------------------------------------
contract MockIdentity {
    uint256 private _nextId = 1;
    mapping(uint256 => address) public owners;
    mapping(uint256 => string)  public uris;

    function register(string calldata agentURI) external returns (uint256 id) {
        id = _nextId++;
        owners[id] = msg.sender;
        uris[id]   = agentURI;
    }

    function setAgentURI(uint256 id, string calldata newURI) external { uris[id] = newURI; }
    function ownerOf(uint256 id) external view returns (address) { return owners[id]; }
}

contract MockReputation {
    struct Feedback { uint256 agentId; int8 score; string uri; }
    Feedback[] public feedbacks;

    function giveFeedback(uint256 agentId, int8 score, string calldata uri) external returns (uint256) {
        feedbacks.push(Feedback(agentId, score, uri));
        return feedbacks.length - 1;
    }

    function feedbackCount() external view returns (uint256) { return feedbacks.length; }
}

// Reputation mock that always reverts — tests the try/catch guard
contract RevertingReputation {
    function giveFeedback(uint256, int8, string calldata) external pure returns (uint256) {
        revert("reputation unavailable");
    }
}

// ---------------------------------------------------------------------------
//  MeridianRegistry tests
// ---------------------------------------------------------------------------
contract MeridianRegistryTest is Test {
    MockIdentity    internal id;
    MockReputation  internal rep;
    MeridianRegistry internal registry;

    address internal admin   = makeAddr("admin");
    address internal keeper  = makeAddr("keeper");
    address internal vault   = makeAddr("vault");
    address internal anyone  = makeAddr("anyone");

    string  constant AGENT_URI = "ipfs://QmAgentURI";
    string  constant IPFS_CID  = "ipfs://QmDecisionCID";

    function setUp() public {
        id  = new MockIdentity();
        rep = new MockReputation();

        vm.prank(admin);
        registry = new MeridianRegistry(vault, address(id), address(rep), keeper);
    }

    // -----------------------------------------------------------------------
    //  testRegisterAgent — admin registers once; agentId set
    // -----------------------------------------------------------------------
    function testRegisterAgent() public {
        // Act
        vm.prank(admin);
        uint256 aid = registry.registerAgent(AGENT_URI);

        // Assert
        assertEq(registry.agentId(), aid, "agentId should be set");
        assertGt(aid, 0, "agentId should be non-zero");
    }

    // -----------------------------------------------------------------------
    //  testRegisterAgentOnlyOnce — second call reverts
    // -----------------------------------------------------------------------
    function testRegisterAgentOnlyOnce() public {
        vm.prank(admin);
        registry.registerAgent(AGENT_URI);

        vm.prank(admin);
        vm.expectRevert("already registered");
        registry.registerAgent(AGENT_URI);
    }

    // -----------------------------------------------------------------------
    //  testRecordDecision — keeper logs a decision; count and data correct
    // -----------------------------------------------------------------------
    function testRecordDecision() public {
        bytes32 hash = keccak256(bytes(IPFS_CID));

        // Act
        vm.prank(keeper);
        registry.recordDecision(hash, IPFS_CID, 50, 100 ether);

        // Assert
        assertEq(registry.decisionCount(), 1, "decisionCount should be 1");

        MeridianRegistry.Decision memory d = registry.getDecision(0);
        assertEq(d.reasoningHash, hash,       "reasoningHash should match");
        assertEq(d.cid,           IPFS_CID,   "cid should match");
        assertEq(d.perfDeltaBps,  50,          "perfDeltaBps should be 50");
        assertEq(d.totalAssets,   100 ether,   "totalAssets should match");
        assertGt(d.timestamp,     0,           "timestamp should be set");
    }

    // -----------------------------------------------------------------------
    //  testHashMismatchReverts — wrong hash → revert
    // -----------------------------------------------------------------------
    function testHashMismatchReverts() public {
        bytes32 badHash = keccak256(bytes("wrong content"));

        vm.prank(keeper);
        vm.expectRevert("hash != cid");
        registry.recordDecision(badHash, IPFS_CID, 0, 0);
    }

    // -----------------------------------------------------------------------
    //  testDecisionCount — multiple decisions increment correctly
    // -----------------------------------------------------------------------
    function testDecisionCount() public {
        string  memory cid1  = "ipfs://QmA";
        string  memory cid2  = "ipfs://QmB";
        string  memory cid3  = "ipfs://QmC";
        bytes32 hash1 = keccak256(bytes(cid1));
        bytes32 hash2 = keccak256(bytes(cid2));
        bytes32 hash3 = keccak256(bytes(cid3));

        vm.startPrank(keeper);
        registry.recordDecision(hash1, cid1, 10,  50 ether);
        registry.recordDecision(hash2, cid2, -5,  60 ether);
        registry.recordDecision(hash3, cid3, 100, 70 ether);
        vm.stopPrank();

        assertEq(registry.decisionCount(), 3, "should have 3 decisions");

        MeridianRegistry.Decision memory d = registry.getDecision(1);
        assertEq(d.perfDeltaBps, -5, "second decision perf should be -5");
    }

    // -----------------------------------------------------------------------
    //  testReputationFailureDoesNotBlockLog — try/catch protects record
    // -----------------------------------------------------------------------
    function testReputationFailureDoesNotBlockLog() public {
        RevertingReputation badRep = new RevertingReputation();
        vm.prank(admin);
        MeridianRegistry reg2 = new MeridianRegistry(vault, address(id), address(badRep), keeper);

        // Register so agentId != 0 (triggers the try/catch path)
        vm.prank(admin);
        reg2.registerAgent(AGENT_URI);

        bytes32 hash = keccak256(bytes(IPFS_CID));

        // Should NOT revert even though reputation.giveFeedback reverts
        vm.prank(keeper);
        reg2.recordDecision(hash, IPFS_CID, 10, 50 ether);

        assertEq(reg2.decisionCount(), 1, "decision should be logged despite reputation failure");
    }
}

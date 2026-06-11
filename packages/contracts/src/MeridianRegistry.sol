// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC8004Identity, IERC8004Reputation} from "./interfaces/IERC8004.sol";

/// @notice Anchors the AI keeper's identity (ERC-8004) and an immutable on-chain decision log.
/// Each rebalance is logged with its IPFS CID and a tamper-evident reasoningHash = keccak256(cid).
contract MeridianRegistry is AccessControl, IERC721Receiver {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    IERC8004Identity   public immutable identity;
    IERC8004Reputation public immutable reputation;
    address            public immutable vault;

    uint256 public agentId; // set once by registerAgent()

    struct Decision {
        uint64  timestamp;
        bytes32 reasoningHash;  // keccak256(bytes(cid)) — tamper-evident link
        string  cid;            // IPFS CID of full reasoning JSON
        int256  perfDeltaBps;   // realized perf vs passive-hold since last decision
        uint256 totalAssets;    // vault TVL snapshot (mETH) at decision time
    }

    Decision[] public decisions;

    event AgentRegistered(uint256 indexed agentId, string agentURI);
    event DecisionRecorded(
        uint256 indexed index,
        bytes32 indexed reasoningHash,
        string  cid,
        int256  perfDeltaBps
    );

    constructor(address _vault, address _identity, address _reputation, address keeper) {
        vault      = _vault;
        identity   = IERC8004Identity(_identity);
        reputation = IERC8004Reputation(_reputation);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KEEPER_ROLE, keeper);
    }

    /// @notice Register the keeper agent on Mantle's ERC-8004 Identity Registry (once).
    function registerAgent(string calldata agentURI) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        require(agentId == 0, "already registered");
        agentId = identity.register(agentURI);
        emit AgentRegistered(agentId, agentURI);
        return agentId;
    }

    /// @notice Keeper anchors each rebalance's reasoning + realized performance on-chain.
    function recordDecision(bytes32 reasoningHash, string calldata cid, int256 perfDeltaBps, uint256 tvl)
        external onlyRole(KEEPER_ROLE)
    {
        // WHY: log can't be forged — any cid change invalidates the hash
        require(reasoningHash == keccak256(bytes(cid)), "hash != cid");

        decisions.push(Decision({
            timestamp:    uint64(block.timestamp),
            reasoningHash: reasoningHash,
            cid:          cid,
            perfDeltaBps: perfDeltaBps,
            totalAssets:  tvl
        }));

        emit DecisionRecorded(decisions.length - 1, reasoningHash, cid, perfDeltaBps);

        // Reputation feedback: positive perf → +1, negative → -1. Wrapped in try/catch
        // so a misbehaving or missing ERC-8004 registry never blocks the decision log.
        if (agentId != 0) {
            int8 score = perfDeltaBps >= 0 ? int8(1) : int8(-1);
            try reputation.giveFeedback(agentId, score, cid) {} catch {}
        }
    }

    function decisionCount() external view returns (uint256) { return decisions.length; }
    function getDecision(uint256 i) external view returns (Decision memory) { return decisions[i]; }

    // Required so identity.register() (_safeMint to this contract) succeeds.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

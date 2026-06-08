// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ERC-8004 Identity — ERC-721 + URIStorage agent registry
interface IERC8004Identity {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function setAgentURI(uint256 agentId, string calldata newURI) external;
    function ownerOf(uint256 agentId) external view returns (address);
}

// ERC-8004 Reputation — on-chain feedback linked to an agent NFT
interface IERC8004Reputation {
    function giveFeedback(uint256 agentId, int8 score, string calldata uri) external returns (uint256 feedbackId);
}

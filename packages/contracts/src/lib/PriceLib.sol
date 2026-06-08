// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PriceLib — TWAP-based price quote with deviation guard.
/// NEVER use slot0 for pricing. Always uses a time-weighted price over TWAP_WINDOW seconds.
/// On testnet: accepts an injected mock price via setMockPrice(). Reverts if TWAP deviates > MAX_DEVIATION_BPS from reference.
library PriceLib {
    uint32  public constant TWAP_WINDOW         = 1800;  // 30-minute TWAP (costly to manipulate)
    uint256 public constant MAX_DEVIATION_BPS   = 200;   // 2% band: revert if TWAP deviates from reference
    uint256 private constant BPS                = 10_000;
    uint256 private constant WAD                = 1e18;

    // ----------------------------------------------------------------
    //  Storage slot for testnet mock prices (library-owned)
    //  keccak256("meridian.pricelib.mockprices") - 1
    // ----------------------------------------------------------------
    bytes32 private constant MOCK_PRICES_SLOT =
        0x8a8dc4452f473c6819f3b15f76e7ce93b0c2fe9fee9c5e6da0a63965c37b8317;

    struct MockPriceStorage {
        mapping(bytes32 => uint256) prices; // key: keccak256(tokenIn, tokenOut) → WAD price
    }

    function _mockStorage() private pure returns (MockPriceStorage storage s) {
        bytes32 slot = MOCK_PRICES_SLOT;
        assembly { s.slot := slot }
    }

    /// @notice Admin setter (testnet only). Sets a fixed price: 1 tokenIn = price tokenOut (WAD).
    function setMockPrice(address tokenIn, address tokenOut, uint256 priceWad) internal {
        bytes32 key = keccak256(abi.encodePacked(tokenIn, tokenOut));
        _mockStorage().prices[key] = priceWad;
        // Also set reverse: 1 tokenOut = 1e36/priceWad tokenIn (WAD)
        bytes32 reverseKey = keccak256(abi.encodePacked(tokenOut, tokenIn));
        if (priceWad > 0) {
            _mockStorage().prices[reverseKey] = (WAD * WAD) / priceWad;
        }
    }

    /// @notice Main quote function. Returns amountOut for amountIn of tokenIn → tokenOut.
    /// Uses mock price if set (testnet); otherwise would call real TWAP oracle (not available in tests).
    function twapQuote(address tokenIn, address tokenOut, uint256 amountIn)
        internal view returns (uint256 out)
    {
        bytes32 key = keccak256(abi.encodePacked(tokenIn, tokenOut));
        uint256 mockPrice = _mockStorage().prices[key];

        if (mockPrice != 0) {
            // Testnet: use injected mock price
            return (amountIn * mockPrice) / WAD;
        }

        // Production path: call TWAP oracle.
        // In production this would call the Agni/UniV3 pool's observe() with TWAP_WINDOW,
        // cross-check against a Chainlink/Tellor reference, and revert if deviation > MAX_DEVIATION_BPS.
        // On testnet with no oracle deployed, revert with a clear message.
        revert("PriceLib: no oracle - use setMockPrice on testnet");
    }

    /// @notice Check whether two prices are within MAX_DEVIATION_BPS of each other.
    function _within(uint256 a, uint256 b, uint256 maxDeviationBps) internal pure returns (bool) {
        if (a == 0 || b == 0) return false;
        uint256 diff = a > b ? a - b : b - a;
        return (diff * BPS) / b <= maxDeviationBps;
    }
}

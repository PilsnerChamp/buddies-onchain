// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Generated from `onchain/contract-data/fonts/chrome/BuddyFont.manifest.json` by `onchain/contract-data/fonts/chrome/tools/gen-metrics.py`.
/// @dev Do not hand-edit. Run `python3 onchain/contract-data/fonts/chrome/tools/gen-metrics.py --write` after manifest changes.
library BuddyFontMetrics {
    uint256 internal constant SCALE = 100;

    // SVG user units, scaled by `SCALE` to preserve the manifest's decimal precision.
    uint256 internal constant FONT_SIZE = 2400;
    uint256 internal constant GLYPH_ADVANCE = 1200;
    uint256 internal constant ASCENT = 2316;
    uint256 internal constant DESCENT = 516;
    uint256 internal constant LINE_HEIGHT = 3000;

    // Manifest-derived payload identity guard for `BuddyFont` constructor inputs.
    uint256 internal constant PAYLOAD_LENGTH = 4092;
    bytes32 internal constant PAYLOAD_SHA256 = 0x015e646cf83e42670b0c196f8a9d558b8894814b037147c962cc6d11015d2865;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Generated from `onchain/contract-data/fonts/sprite/BuddySpriteFont.manifest.json` by `onchain/contract-data/fonts/sprite/tools/gen-metrics.py`.
/// @dev Do not hand-edit. Run `python3 onchain/contract-data/fonts/sprite/tools/gen-metrics.py --write` after manifest changes.
///      Raw font-unit values — no pre-scaling to a font size or SCALE factor.
///      Consumers compute SVG pixel values via `(rawMetric * fontSize) / UPEM`.
library BuddySpriteFontMetrics {
    uint256 internal constant UPEM = 2048;
    uint256 internal constant ADVANCE = 1233;
    uint256 internal constant ASCENT = 1901;
    uint256 internal constant DESCENT = 483;

    // Manifest-derived payload identity guard for `BuddySpriteFont` constructor inputs.
    uint256 internal constant PAYLOAD_LENGTH = 3228;
    bytes32 internal constant PAYLOAD_SHA256 = 0x33d2220889206d08f97cb821b6c82410411c44581f93204becafea0b84e8d290;
}

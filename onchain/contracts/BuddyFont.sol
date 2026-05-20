// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BuddyFontPayload} from "./BuddyFontPayload.sol";
import {BuddyFontMetrics} from "./libraries/BuddyFontMetrics.sol";

/// @title BuddyFont
/// @notice Holds the committed Buddy WOFF2 subset and exposes it as an embeddable data URI.
contract BuddyFont is BuddyFontPayload {
    string private constant FONT_FACE_PREFIX =
        "@font-face{font-family:'BuddyFont';src:url('";
    string private constant FONT_FACE_SUFFIX =
        "') format('woff2');font-weight:600;font-style:normal;font-display:block}.stat{font-family:'BuddyFont',monospace}";

    constructor(bytes memory payload_)
        BuddyFontPayload(payload_, BuddyFontMetrics.PAYLOAD_LENGTH, BuddyFontMetrics.PAYLOAD_SHA256)
    {}

    function _fontFacePrefix() internal pure override returns (string memory) {
        return FONT_FACE_PREFIX;
    }

    function _fontFaceSuffix() internal pure override returns (string memory) {
        return FONT_FACE_SUFFIX;
    }
}

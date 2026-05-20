// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BuddyFontPayload} from "./BuddyFontPayload.sol";
import {BuddySpriteFontMetrics} from "./libraries/BuddySpriteFontMetrics.sol";

/// @title BuddySpriteFont
/// @notice Holds the committed DejaVu Sans Mono WOFF2 sprite subset and exposes it as an embeddable data URI.
contract BuddySpriteFont is BuddyFontPayload {
    string private constant FONT_FACE_PREFIX =
        "@font-face{font-family:'BuddySpriteFont';src:url('";
    string private constant FONT_FACE_SUFFIX =
        "') format('woff2');font-weight:400;font-style:normal;font-display:block}.sprite{font-family:'BuddySpriteFont',monospace}";

    constructor(bytes memory payload_)
        BuddyFontPayload(payload_, BuddySpriteFontMetrics.PAYLOAD_LENGTH, BuddySpriteFontMetrics.PAYLOAD_SHA256)
    {}

    function _fontFacePrefix() internal pure override returns (string memory) {
        return FONT_FACE_PREFIX;
    }

    function _fontFaceSuffix() internal pure override returns (string memory) {
        return FONT_FACE_SUFFIX;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title SvgDecode
/// @notice Canonical tokenURI/SVG decode + substring helpers shared across the claim
///         render-flip suites. Single source of truth so the hermetic (§1) and fork
///         (§2) tests assert against byte-identical decode logic instead of per-suite
///         copies that can silently drift.
library SvgDecode {
    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";

    /// @dev `data:application/json;base64,<...>` tokenURI -> decoded JSON string.
    function decodeJson(string memory tokenUri) internal pure returns (string memory) {
        return string(Base64.decode(afterPrefix(tokenUri, JSON_PREFIX)));
    }

    /// @dev `data:image/svg+xml;base64,<...>` image field -> decoded SVG string.
    function decodeSvg(string memory imageUri) internal pure returns (string memory) {
        return string(Base64.decode(afterPrefix(imageUri, SVG_PREFIX)));
    }

    function afterPrefix(string memory value, string memory prefix) internal pure returns (string memory) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        require(startsWith(value, prefix), "missing prefix");

        bytes memory tail = new bytes(valueBytes.length - prefixBytes.length);
        for (uint256 i = 0; i < tail.length; ++i) {
            tail[i] = valueBytes[i + prefixBytes.length];
        }
        return string(tail);
    }

    function startsWith(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (prefixBytes.length > valueBytes.length) {
            return false;
        }
        for (uint256 i = 0; i < prefixBytes.length; ++i) {
            if (valueBytes[i] != prefixBytes[i]) {
                return false;
            }
        }
        return true;
    }

    function contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);
        if (needleBytes.length == 0) {
            return true;
        }
        if (needleBytes.length > haystackBytes.length) {
            return false;
        }
        for (uint256 i = 0; i <= haystackBytes.length - needleBytes.length; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < needleBytes.length; ++j) {
                if (haystackBytes[i + j] != needleBytes[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                return true;
            }
        }
        return false;
    }
}

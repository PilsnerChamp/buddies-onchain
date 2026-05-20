// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {BuddyFontPayload} from "../contracts/BuddyFontPayload.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {BuddySpriteFontMetrics} from "../contracts/libraries/BuddySpriteFontMetrics.sol";

contract BuddySpriteFontTest is Test {
    using stdJson for string;

    string internal constant MANIFEST_PATH = "contract-data/fonts/sprite/BuddySpriteFont.manifest.json";
    string internal constant FONT_PATH = "contract-data/fonts/sprite/BuddySpriteFont.woff2";
    string internal constant DATA_URI_PREFIX = "data:font/woff2;base64,";

    BuddySpriteFont internal font;
    string internal manifestJson;
    bytes internal sourcePayload;

    function setUp() public {
        manifestJson = vm.readFile(MANIFEST_PATH);
        sourcePayload = vm.readFileBinary(FONT_PATH);
        font = new BuddySpriteFont(sourcePayload);
    }

    function test_payloadRoundTripsAndMatchesManifestSha256() public view {
        bytes memory payload = font.payload();

        assertEq(payload, sourcePayload);
        assertEq(payload.length, _expectedPayloadLength());
        assertEq(sha256(payload), _expectedPayloadSha256());
    }

    function test_fontDataUriDecodesBackToRawPayload() public view {
        string memory uri = font.fontDataUri();
        assertTrue(_startsWith(uri, DATA_URI_PREFIX));

        bytes memory decoded = Base64.decode(_afterPrefix(uri, DATA_URI_PREFIX));
        assertEq(decoded, sourcePayload);
    }

    function test_fontCssEmbedsSpriteClassAndFontFace() public view {
        string memory css = font.fontCss();

        assertTrue(_contains(css, "@font-face"));
        assertTrue(_contains(css, "font-family:'BuddySpriteFont'"));
        assertTrue(_contains(css, ".sprite{font-family:'BuddySpriteFont',monospace}"));
        assertTrue(_contains(css, DATA_URI_PREFIX));
        assertTrue(_contains(css, "font-weight:400"));
        // No font-size or fill — those are set by the renderer
        assertFalse(_contains(css, "font-size"));
        assertFalse(_contains(css, "fill:"));
    }

    function test_constructorRevertsOnPayloadSha256Drift() public {
        bytes memory mutated = bytes.concat(sourcePayload);
        mutated[0] = bytes1(uint8(mutated[0]) ^ 0x01);

        vm.expectRevert(
            abi.encodeWithSelector(
                BuddyFontPayload.UnexpectedPayloadSha256.selector,
                sha256(mutated),
                BuddySpriteFontMetrics.PAYLOAD_SHA256
            )
        );
        new BuddySpriteFont(mutated);
    }

    function test_constructorRevertsOnPayloadLengthDrift() public {
        bytes memory truncated = new bytes(sourcePayload.length - 1);
        for (uint256 i = 0; i < truncated.length; ++i) {
            truncated[i] = sourcePayload[i];
        }

        vm.expectRevert(
            abi.encodeWithSelector(
                BuddyFontPayload.UnexpectedPayloadLength.selector,
                truncated.length,
                BuddySpriteFontMetrics.PAYLOAD_LENGTH
            )
        );
        new BuddySpriteFont(truncated);
    }

    function test_metricsLibraryMatchesManifest() public view {
        uint256 upem = manifestJson.readUint(".metrics.rawValues.upem");
        uint256 advanceRaw = manifestJson.readUint(".metrics.rawValues.advance");
        uint256 ascentRaw = manifestJson.readUint(".metrics.rawValues.ascent");
        int256 descentRaw = manifestJson.readInt(".metrics.rawValues.descent");

        assertEq(BuddySpriteFontMetrics.UPEM, upem);
        assertEq(BuddySpriteFontMetrics.ADVANCE, advanceRaw);
        assertEq(BuddySpriteFontMetrics.ASCENT, ascentRaw);
        // casting to uint256 is safe because the manifest descent is negative by font convention.
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(BuddySpriteFontMetrics.DESCENT, uint256(-descentRaw));
        assertEq(BuddySpriteFontMetrics.PAYLOAD_LENGTH, _expectedPayloadLength());
        assertEq(BuddySpriteFontMetrics.PAYLOAD_SHA256, _expectedPayloadSha256());
    }

    function _expectedPayloadLength() internal view returns (uint256) {
        return manifestJson.readUint(".output.sizeBytes");
    }

    function _expectedPayloadSha256() internal view returns (bytes32) {
        return vm.parseBytes32(string.concat("0x", manifestJson.readString(".output.sha256")));
    }

    function _startsWith(string memory value, string memory prefix) internal pure returns (bool) {
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

    function _afterPrefix(string memory value, string memory prefix) internal pure returns (string memory) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        require(valueBytes.length >= prefixBytes.length, "prefix too long");

        bytes memory tail = new bytes(valueBytes.length - prefixBytes.length);
        for (uint256 i = 0; i < tail.length; ++i) {
            tail[i] = valueBytes[i + prefixBytes.length];
        }

        return string(tail);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);

        if (needleBytes.length == 0) {
            return true;
        }
        if (needleBytes.length > haystackBytes.length) {
            return false;
        }

        for (uint256 i = 0; i <= haystackBytes.length - needleBytes.length; ++i) {
            bool matched = true;
            for (uint256 j = 0; j < needleBytes.length; ++j) {
                if (haystackBytes[i + j] != needleBytes[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                return true;
            }
        }

        return false;
    }
}

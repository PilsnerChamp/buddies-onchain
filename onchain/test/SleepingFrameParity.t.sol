// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";

/// @title SleepingFrameParityTest
/// @notice Cross-domain parity gate for the plugin's local sleeping render.
/// @dev Reads `test/vectors/sleeping-frame-vectors.json` -- the same fixture
///      file `plugin/test/sleeping-frame-parity.test.ts` consumes -- and
///      asserts the contract's blink frame `fb` rows match `expectedFb`
///      row-for-row for each fixture UUID.
///
///      A drift on either side (sprite source change without atlas regen,
///      hash algorithm divergence, hat-injection rule, eye sub) fails
///      exactly one suite loudly.
contract SleepingFrameParityTest is Test {
    using stdJson for string;

    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";
    bytes1 internal constant ASCII_GT = 0x3e;

    BuddySpriteData internal spriteData;
    BuddyFont internal buddyFont;
    BuddySpriteFont internal buddySpriteFont;
    BuddyRenderer internal renderer;
    BuddyNFT internal nft;
    address internal owner;

    function setUp() public {
        spriteData = new BuddySpriteData();
        buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        buddySpriteFont = new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));

        owner = makeAddr("owner");
        nft = new BuddyNFT(owner, address(renderer));
    }

    function test_sleepingFrame_parityWithSharedVectors() public {
        string memory json = vm.readFile("test/vectors/sleeping-frame-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".vectorCount"), (uint256));
        require(vectorCount >= 3, "need >=3 sleeping-frame parity fixtures");

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            string memory accountUuid = abi.decode(vm.parseJson(json, string.concat(prefix, ".accountUuid")), (string));
            string[] memory expectedFb = abi.decode(vm.parseJson(json, string.concat(prefix, ".expectedFb")), (string[]));

            uint256 tokenId = nft.hatch(accountUuid);
            string memory tokenUri = nft.tokenURI(tokenId);
            string memory svg = _decodeSvgFromTokenUri(tokenUri);
            string memory fbGroup = _extractGroup(svg, "fb");
            string[] memory actualFb = _extractSpriteRows(fbGroup);

            assertEq(
                actualFb.length,
                expectedFb.length,
                string.concat("fb row count mismatch at ", prefix, " (", accountUuid, ")")
            );
            for (uint256 r = 0; r < actualFb.length; r++) {
                assertEq(
                    actualFb[r],
                    expectedFb[r],
                    string.concat("fb row ", vm.toString(r), " mismatch at ", prefix, " (", accountUuid, ")")
                );
            }
        }
    }

    /// @notice Blink frame `fb` must differ from open frame `f0` only at eye
    ///         glyph positions, where `eyeGlyph -> "-"`. All non-eye glyphs
    ///         (body, hat, frame) stay byte-identical. Catches accidental
    ///         row-level mutation in the blink path (`isBlink=true`) of
    ///         `BuddyRenderer._spriteRow`.
    function test_sleepingFrame_blinkDiffIsEyesOnly() public {
        string memory json = vm.readFile("test/vectors/sleeping-frame-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".vectorCount"), (uint256));

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            string memory accountUuid = abi.decode(vm.parseJson(json, string.concat(prefix, ".accountUuid")), (string));
            uint256 eyesIndex = abi.decode(vm.parseJson(json, string.concat(prefix, ".eyesIndex")), (uint256));
            string memory eyeGlyph = _eyeGlyphForIndex(uint8(eyesIndex));

            uint256 tokenId = nft.hatch(accountUuid);
            string memory svg = _decodeSvgFromTokenUri(nft.tokenURI(tokenId));
            string[] memory f0Rows = _extractSpriteRows(_extractGroup(svg, "f0"));
            string[] memory fbRows = _extractSpriteRows(_extractGroup(svg, "fb"));

            assertEq(
                f0Rows.length,
                fbRows.length,
                string.concat("f0/fb row count mismatch at ", prefix, " (", accountUuid, ")")
            );

            for (uint256 r = 0; r < f0Rows.length; r++) {
                string memory normalized = _replaceAll(f0Rows[r], eyeGlyph, "-");
                assertEq(
                    normalized,
                    fbRows[r],
                    string.concat(
                        "eyes-only invariant broken at row ",
                        vm.toString(r),
                        " of ",
                        prefix,
                        " (",
                        accountUuid,
                        ")"
                    )
                );
            }
        }
    }

    /// @dev Index-aligned mirror of `BuddyRenderer._eyeGlyph`. Keeping a local
    ///      copy avoids touching renderer visibility just for a parity test.
    function _eyeGlyphForIndex(uint8 eyes) internal pure returns (string memory) {
        if (eyes == 0) return unicode"·";
        if (eyes == 1) return unicode"✦";
        if (eyes == 2) return unicode"×";
        if (eyes == 3) return unicode"◉";
        if (eyes == 4) return "@";
        if (eyes == 5) return unicode"°";
        return "?";
    }

    /// @dev Byte-level replaceAll. Works on multi-byte UTF-8 needles because the
    ///      renderer emits eye glyphs as contiguous bytes and never splits them.
    function _replaceAll(string memory haystack, string memory needle, string memory replacement)
        internal
        pure
        returns (string memory)
    {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        bytes memory rep = bytes(replacement);
        if (n.length == 0 || h.length < n.length) return haystack;

        uint256 count;
        {
            uint256 i;
            while (i + n.length <= h.length) {
                if (_hasNeedleAt(h, n, i)) {
                    count++;
                    i += n.length;
                } else {
                    i++;
                }
            }
        }
        if (count == 0) return haystack;

        bytes memory out = new bytes(h.length + count * rep.length - count * n.length);
        uint256 w;
        uint256 k;
        while (k < h.length) {
            if (k + n.length <= h.length && _hasNeedleAt(h, n, k)) {
                for (uint256 j = 0; j < rep.length; j++) out[w++] = rep[j];
                k += n.length;
            } else {
                out[w++] = h[k];
                k++;
            }
        }
        return string(out);
    }

    function _hasNeedleAt(bytes memory h, bytes memory n, uint256 at) internal pure returns (bool) {
        for (uint256 j = 0; j < n.length; j++) {
            if (h[at + j] != n[j]) return false;
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // SVG decoding + sprite row extraction
    // -------------------------------------------------------------------------

    function _decodeJson(string memory tokenUri) internal pure returns (string memory) {
        return string(Base64.decode(_afterPrefix(tokenUri, JSON_PREFIX)));
    }

    function _decodeSvgFromTokenUri(string memory tokenUri) internal pure returns (string memory) {
        return _decodeSvg(_decodeJson(tokenUri).readString(".image"));
    }

    function _decodeSvg(string memory imageUri) internal pure returns (string memory) {
        return string(Base64.decode(_afterPrefix(imageUri, SVG_PREFIX)));
    }

    function _afterPrefix(string memory value, string memory prefix) internal pure returns (string memory) {
        bytes memory v = bytes(value);
        bytes memory p = bytes(prefix);
        require(v.length >= p.length, "missing prefix");
        for (uint256 i = 0; i < p.length; i++) require(v[i] == p[i], "missing prefix");
        bytes memory tail = new bytes(v.length - p.length);
        for (uint256 i = 0; i < tail.length; i++) tail[i] = v[i + p.length];
        return string(tail);
    }

    /// @dev Slice the inner content of `<g id="<id>"...>...</g>`.
    function _extractGroup(string memory svg, string memory groupId) internal pure returns (string memory) {
        bytes memory svgBytes = bytes(svg);
        bytes memory openMarker = bytes(string.concat('<g id="', groupId, '"'));
        uint256 start = _indexOf(svgBytes, openMarker, 0);
        require(start != type(uint256).max, "group open not found");

        uint256 tagClose = start + openMarker.length;
        while (tagClose < svgBytes.length && svgBytes[tagClose] != ASCII_GT) ++tagClose;
        require(tagClose < svgBytes.length, "group open tag not closed");
        uint256 contentStart = tagClose + 1;

        uint256 contentEnd = _indexOf(svgBytes, bytes("</g>"), contentStart);
        require(contentEnd != type(uint256).max, "group close not found");

        bytes memory slice = new bytes(contentEnd - contentStart);
        for (uint256 i = 0; i < slice.length; i++) slice[i] = svgBytes[contentStart + i];
        return string(slice);
    }

    /// @dev Pull every `<text class="sprite" ... >ROW</text>` body, decode XML
    ///      entities, and right-trim. Mirrors `extractSpriteFrame` in
    ///      `plugin/src/sprite.ts`.
    function _extractSpriteRows(string memory group) internal pure returns (string[] memory rows) {
        bytes memory g = bytes(group);
        bytes memory openMarker = bytes('<text class="sprite"');
        bytes memory close = bytes("</text>");

        uint256 count;
        uint256 cursor;
        while (true) {
            uint256 idx = _indexOf(g, openMarker, cursor);
            if (idx == type(uint256).max) break;
            uint256 tagClose = idx + openMarker.length;
            while (tagClose < g.length && g[tagClose] != ASCII_GT) ++tagClose;
            uint256 endIdx = _indexOf(g, close, tagClose + 1);
            require(endIdx != type(uint256).max, "sprite close not found");
            count++;
            cursor = endIdx + close.length;
        }

        rows = new string[](count);

        uint256 r;
        cursor = 0;
        while (r < count) {
            uint256 idx = _indexOf(g, openMarker, cursor);
            uint256 tagClose = idx + openMarker.length;
            while (g[tagClose] != ASCII_GT) ++tagClose;
            uint256 bodyStart = tagClose + 1;
            uint256 endIdx = _indexOf(g, close, bodyStart);

            bytes memory raw = new bytes(endIdx - bodyStart);
            for (uint256 i = 0; i < raw.length; i++) raw[i] = g[bodyStart + i];

            rows[r] = _rightTrim(_decodeXmlEntities(raw));
            cursor = endIdx + close.length;
            r++;
        }
    }

    /// @dev Decode the XML entities BuddyRenderer emits in sprite rows:
    ///      `&lt;`, `&gt;`, `&amp;`, `&quot;`, `&apos;`. No others appear in
    ///      sprite content.
    function _decodeXmlEntities(bytes memory src) internal pure returns (string memory) {
        bytes memory out = new bytes(src.length);
        uint256 w;
        uint256 i;
        while (i < src.length) {
            if (src[i] == "&") {
                if (_hasEntity(src, i, "&lt;")) { out[w++] = "<"; i += 4; continue; }
                if (_hasEntity(src, i, "&gt;")) { out[w++] = ">"; i += 4; continue; }
                if (_hasEntity(src, i, "&amp;")) { out[w++] = "&"; i += 5; continue; }
                if (_hasEntity(src, i, "&quot;")) { out[w++] = '"'; i += 6; continue; }
                if (_hasEntity(src, i, "&apos;")) { out[w++] = "'"; i += 6; continue; }
            }
            out[w++] = src[i];
            i++;
        }
        bytes memory trimmed = new bytes(w);
        for (uint256 k = 0; k < w; k++) trimmed[k] = out[k];
        return string(trimmed);
    }

    function _hasEntity(bytes memory src, uint256 at, string memory entity) internal pure returns (bool) {
        bytes memory e = bytes(entity);
        if (at + e.length > src.length) return false;
        for (uint256 i = 0; i < e.length; i++) if (src[at + i] != e[i]) return false;
        return true;
    }

    /// @dev Right-trim ASCII space (0x20) only — same as JS `.replace(/\s+$/, '')`
    ///      operating on sprite rows that contain no other ASCII whitespace.
    function _rightTrim(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 end = b.length;
        while (end > 0 && b[end - 1] == 0x20) --end;
        bytes memory out = new bytes(end);
        for (uint256 i = 0; i < end; i++) out[i] = b[i];
        return string(out);
    }

    function _indexOf(bytes memory haystack, bytes memory needle, uint256 from) internal pure returns (uint256) {
        if (needle.length == 0 || haystack.length < needle.length) return type(uint256).max;
        for (uint256 i = from; i + needle.length <= haystack.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) { match_ = false; break; }
            }
            if (match_) return i;
        }
        return type(uint256).max;
    }
}

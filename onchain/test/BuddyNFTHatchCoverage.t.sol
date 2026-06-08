// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {HatchCoverageUuids} from "./helpers/HatchCoverageUuids.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

contract BuddyNFTHatchCoverage is Test, HatchCoverageUuids, HatchHelper {
    string internal constant MANIFEST_PATH = "contract-data/hatch-coverage/manifest.json";
    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";
    string internal constant BLANK_TOP_ROW =
        '<text class="sprite" x="21" y="125" xml:space="preserve">                 </text>';

    struct ExpectedTraits {
        uint256 species;
        uint256 rarity;
        uint256 eyes;
        uint256 hat;
        bool shiny;
        uint256 debugging;
        uint256 patience;
        uint256 chaos;
        uint256 wisdom;
        uint256 snark;
    }

    struct ManifestEntry {
        string uuid;
        uint256 tokenId;
        uint256 seed;
        ExpectedTraits traits;
    }

    BuddyNFT internal nft;
    BuddySpriteData internal spriteData;
    string[] internal uuids;
    ManifestEntry[] internal manifest;

    function setUp() public {
        BuddyFont buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        BuddySpriteFont buddySpriteFont =
            new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        spriteData = new BuddySpriteData();
        BuddyRenderer renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        nft = new BuddyNFT(address(this), address(renderer));

        uuids = hatchCoverageUuids();

        string memory manifestJson = vm.readFile(MANIFEST_PATH);
        for (uint256 i; i < uuids.length; ++i) {
            manifest.push(_parseManifestEntry(manifestJson, i));
        }
    }

    function test_hatchCoverageFixtures() public {
        assertEq(manifest.length, uuids.length, "manifest length mismatch");
        uint256 svgSplit = uuids.length / 2;

        for (uint256 i; i < uuids.length; ++i) {
            string memory uuid = uuids[i];
            ManifestEntry storage expected = manifest[i];

            assertEq(expected.uuid, uuid, string.concat("manifest uuid mismatch for ", uuid));

            uint256 tokenId = _hatchUuid(nft, uuid);
            assertEq(tokenId, expected.tokenId, string.concat("tokenId mismatch for ", uuid));

            assertEq(uint256(nft.buddyPrngSeed(tokenId)), expected.seed, string.concat("seed mismatch for ", uuid));
            _assertTraitsEq(uuid, nft.buddyTraits(tokenId), expected.traits);
            string memory tokenUri = nft.tokenURI(tokenId);
            _assertTokenUriJson(uuid, tokenId, tokenUri, expected.traits);
            if (i < svgSplit) {
                _assertTokenUriSvg(uuid, tokenUri, expected.traits);
            }
        }
    }

    function test_hatchCoverageSvgStructure() public {
        assertEq(manifest.length, uuids.length, "manifest length mismatch");

        uint256 svgSplit = uuids.length / 2;
        for (uint256 i = svgSplit; i < uuids.length; ++i) {
            string memory uuid = uuids[i];
            ManifestEntry storage expected = manifest[i];

            uint256 tokenId = _hatchUuid(nft, uuid);
            _assertTokenUriSvg(uuid, nft.tokenURI(tokenId), expected.traits);
        }
    }

    /// @dev Manifest schema duplicated from CheckHatchCoverageUuids.s.sol — intentional per spec (no shared helper).
    function _parseManifestEntry(string memory json, uint256 index) internal pure returns (ManifestEntry memory entry) {
        string memory prefix = string.concat("$[", vm.toString(index), "]");
        string memory traitsPrefix = string.concat(prefix, ".traits");

        entry.uuid = vm.parseJsonString(json, string.concat(prefix, ".uuid"));
        entry.tokenId = vm.parseJsonUint(json, string.concat(prefix, ".tokenId"));
        entry.seed = vm.parseJsonUint(json, string.concat(prefix, ".seed"));
        entry.traits = ExpectedTraits({
            species: vm.parseJsonUint(json, string.concat(traitsPrefix, ".species")),
            rarity: vm.parseJsonUint(json, string.concat(traitsPrefix, ".rarity")),
            eyes: vm.parseJsonUint(json, string.concat(traitsPrefix, ".eyes")),
            hat: vm.parseJsonUint(json, string.concat(traitsPrefix, ".hat")),
            shiny: vm.parseJsonBool(json, string.concat(traitsPrefix, ".shiny")),
            debugging: vm.parseJsonUint(json, string.concat(traitsPrefix, ".debugging")),
            patience: vm.parseJsonUint(json, string.concat(traitsPrefix, ".patience")),
            chaos: vm.parseJsonUint(json, string.concat(traitsPrefix, ".chaos")),
            wisdom: vm.parseJsonUint(json, string.concat(traitsPrefix, ".wisdom")),
            snark: vm.parseJsonUint(json, string.concat(traitsPrefix, ".snark"))
        });
    }

    function _assertTraitsEq(string memory uuid, IBuddyNFT.BuddyTraits memory actual, ExpectedTraits storage expected)
        internal
        view
    {
        assertEq(uint256(actual.species), expected.species, string.concat("species mismatch for ", uuid));
        assertEq(uint256(actual.rarity), expected.rarity, string.concat("rarity mismatch for ", uuid));
        assertEq(uint256(actual.eyes), expected.eyes, string.concat("eyes mismatch for ", uuid));
        assertEq(uint256(actual.hat), expected.hat, string.concat("hat mismatch for ", uuid));
        assertEq(actual.shiny, expected.shiny, string.concat("shiny mismatch for ", uuid));
        assertEq(uint256(actual.debugging), expected.debugging, string.concat("debugging mismatch for ", uuid));
        assertEq(uint256(actual.patience), expected.patience, string.concat("patience mismatch for ", uuid));
        assertEq(uint256(actual.chaos), expected.chaos, string.concat("chaos mismatch for ", uuid));
        assertEq(uint256(actual.wisdom), expected.wisdom, string.concat("wisdom mismatch for ", uuid));
        assertEq(uint256(actual.snark), expected.snark, string.concat("snark mismatch for ", uuid));
    }

    function _assertTokenUriJson(
        string memory uuid,
        uint256 tokenId,
        string memory tokenUri,
        ExpectedTraits storage traits
    ) internal view {
        assertTrue(_startsWith(tokenUri, JSON_PREFIX), string.concat("json prefix missing for ", uuid));
        string memory json = _decodeJson(uuid, tokenUri);

        assertEq(
            vm.parseJsonString(json, ".name"),
            string.concat("Buddy Onchain #", vm.toString(tokenId)),
            string.concat("metadata name mismatch for ", uuid)
        );
        _assertJsonAttributes(uuid, json, traits);
    }

    /// @dev Trait-axis structural assertions only; renderer chrome invariants live in BuddyRenderer.t.sol.
    function _assertTokenUriSvg(string memory uuid, string memory tokenUri, ExpectedTraits storage traits)
        internal
        view
    {
        assertTrue(_startsWith(tokenUri, JSON_PREFIX), string.concat("json prefix missing for ", uuid));
        string memory json = _decodeJson(uuid, tokenUri);
        string memory imageUri = vm.parseJsonString(json, ".image");
        assertTrue(_startsWith(imageUri, SVG_PREFIX), string.concat("svg prefix missing for ", uuid));
        string memory svg = _decodeSvg(uuid, imageUri);

        assertTrue(_startsWith(svg, "<svg"), string.concat("svg open missing for ", uuid));
        assertTrue(_endsWith(svg, "</svg>"), string.concat("svg close missing for ", uuid));
        assertEq(_countOccurrences(svg, "<circle"), 3, string.concat("background circle count mismatch for ", uuid));

        string memory titleRow = _visibleTitleRow(uuid, svg);
        assertTrue(
            _contains(titleRow, _upper(_speciesLabel(uint8(traits.species)))),
            string.concat("species label missing for ", uuid)
        );
        assertTrue(
            _contains(titleRow, _upper(_rarityLabel(uint8(traits.rarity)))),
            string.concat("rarity label missing for ", uuid)
        );
        // Eye glyph must appear OUTSIDE the title row. `✦` (eyes==1) also lives
        // in SHINY_PREFIX (renderer line 55), so a broken `_replaceEyes` would
        // silently pass for `(shiny=true, eyes=1)` if we searched the whole SVG.
        string memory glyph = _eyeGlyph(uint8(traits.eyes));
        assertGt(
            _countOccurrences(svg, glyph),
            _countOccurrences(titleRow, glyph),
            string.concat("eye glyph missing outside title row for ", uuid)
        );

        _assertHatLayout(uuid, svg, uint8(traits.hat));
        _assertShinyLabel(uuid, titleRow, traits.shiny);
    }

    function _assertJsonAttributes(string memory uuid, string memory json, ExpectedTraits storage traits)
        internal
        view
    {
        _assertStringAttribute(json, 0, "Species", _speciesLabel(uint8(traits.species)), uuid);
        _assertStringAttribute(json, 1, "Rarity", _rarityLabel(uint8(traits.rarity)), uuid);
        _assertStringAttribute(json, 2, "Eyes", _eyeLabel(uint8(traits.eyes)), uuid);
        _assertStringAttribute(json, 3, "Hat", _hatLabel(uint8(traits.hat)), uuid);
        _assertStringAttribute(json, 4, "Shiny", traits.shiny ? "Yes" : "No", uuid);
        _assertStringAttribute(json, 5, "Stage", "Hatched", uuid);
        _assertUintAttribute(json, 6, "Debugging", traits.debugging, uuid);
        _assertUintAttribute(json, 7, "Patience", traits.patience, uuid);
        _assertUintAttribute(json, 8, "Chaos", traits.chaos, uuid);
        _assertUintAttribute(json, 9, "Wisdom", traits.wisdom, uuid);
        _assertUintAttribute(json, 10, "Snark", traits.snark, uuid);
    }

    function _assertStringAttribute(
        string memory json,
        uint256 index,
        string memory traitType,
        string memory value,
        string memory uuid
    ) internal pure {
        string memory prefix = string.concat(".attributes[", vm.toString(index), "]");
        assertEq(
            vm.parseJsonString(json, string.concat(prefix, ".trait_type")),
            traitType,
            string.concat(traitType, " trait_type mismatch for ", uuid)
        );
        assertEq(
            vm.parseJsonString(json, string.concat(prefix, ".value")),
            value,
            string.concat(traitType, " value mismatch for ", uuid)
        );
    }

    function _assertUintAttribute(
        string memory json,
        uint256 index,
        string memory traitType,
        uint256 value,
        string memory uuid
    ) internal pure {
        string memory prefix = string.concat(".attributes[", vm.toString(index), "]");
        assertEq(
            vm.parseJsonString(json, string.concat(prefix, ".trait_type")),
            traitType,
            string.concat(traitType, " trait_type mismatch for ", uuid)
        );
        assertEq(
            vm.parseJsonUint(json, string.concat(prefix, ".value")),
            value,
            string.concat(traitType, " value mismatch for ", uuid)
        );
    }

    function _assertHatLayout(string memory uuid, string memory svg, uint8 hat) internal view {
        if (hat == 0) {
            assertTrue(_contains(svg, BLANK_TOP_ROW), string.concat("hatless top row missing for ", uuid));
            return;
        }

        assertFalse(_contains(svg, BLANK_TOP_ROW), string.concat("hatted top row unexpectedly blank for ", uuid));
        assertTrue(_contains(svg, _escapedPaddedHatRow(hat)), string.concat("hat row missing for ", uuid));
    }

    function _assertShinyLabel(string memory uuid, string memory svg, bool shiny) internal pure {
        if (shiny) {
            assertTrue(_contains(svg, unicode"✦SHINY✦"), string.concat("shiny label missing for ", uuid));
        } else {
            assertFalse(_contains(svg, unicode"✦SHINY✦"), string.concat("non-shiny label present for ", uuid));
        }
    }

    function _decodeJson(string memory uuid, string memory tokenUri) internal pure returns (string memory) {
        return
            string(Base64.decode(_afterPrefix(tokenUri, JSON_PREFIX, string.concat("json prefix missing for ", uuid))));
    }

    function _decodeSvg(string memory uuid, string memory imageUri) internal pure returns (string memory) {
        return string(Base64.decode(_afterPrefix(imageUri, SVG_PREFIX, string.concat("svg prefix missing for ", uuid))));
    }

    function _afterPrefix(string memory value, string memory prefix, string memory errorMessage)
        internal
        pure
        returns (string memory)
    {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);

        if (!_startsWith(value, prefix)) {
            revert(errorMessage);
        }

        bytes memory tail = new bytes(valueBytes.length - prefixBytes.length);
        for (uint256 i; i < tail.length; ++i) {
            tail[i] = valueBytes[i + prefixBytes.length];
        }
        return string(tail);
    }

    function _escapedPaddedHatRow(uint8 hat) internal view returns (string memory) {
        return _xmlEscape(string.concat("  ", spriteData.getHatRow(hat), "  "));
    }

    function _xmlEscape(string memory value) internal pure returns (string memory escaped) {
        bytes memory input = bytes(value);
        for (uint256 i; i < input.length; ++i) {
            bytes1 char = input[i];
            if (char == "&") {
                escaped = string.concat(escaped, "&amp;");
            } else if (char == "<") {
                escaped = string.concat(escaped, "&lt;");
            } else if (char == ">") {
                escaped = string.concat(escaped, "&gt;");
            } else if (char == '"') {
                escaped = string.concat(escaped, "&quot;");
            } else if (char == "'") {
                escaped = string.concat(escaped, "&apos;");
            } else {
                escaped = string.concat(escaped, string(abi.encodePacked(char)));
            }
        }
    }

    function _startsWith(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);

        if (prefixBytes.length > valueBytes.length) {
            return false;
        }

        for (uint256 i; i < prefixBytes.length; ++i) {
            if (valueBytes[i] != prefixBytes[i]) {
                return false;
            }
        }

        return true;
    }

    function _endsWith(string memory value, string memory suffix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory suffixBytes = bytes(suffix);

        if (suffixBytes.length > valueBytes.length) {
            return false;
        }

        uint256 offset = valueBytes.length - suffixBytes.length;
        for (uint256 i; i < suffixBytes.length; ++i) {
            if (valueBytes[offset + i] != suffixBytes[i]) {
                return false;
            }
        }

        return true;
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

        for (uint256 i; i <= haystackBytes.length - needleBytes.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < needleBytes.length; ++j) {
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

    function _indexOf(bytes memory haystack, bytes memory needle, uint256 from) internal pure returns (uint256) {
        if (needle.length == 0 || needle.length > haystack.length || from > haystack.length - needle.length) {
            return type(uint256).max;
        }

        for (uint256 i = from; i <= haystack.length - needle.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < needle.length; ++j) {
                if (haystack[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                return i;
            }
        }

        return type(uint256).max;
    }

    function _countOccurrences(string memory haystack, string memory needle) internal pure returns (uint256 count) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);

        if (needleBytes.length == 0 || needleBytes.length > haystackBytes.length) {
            return 0;
        }

        for (uint256 i; i <= haystackBytes.length - needleBytes.length; ++i) {
            bool match_ = true;
            for (uint256 j; j < needleBytes.length; ++j) {
                if (haystackBytes[i + j] != needleBytes[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                ++count;
            }
        }
    }

    function _visibleTitleRow(string memory uuid, string memory svg) internal pure returns (string memory) {
        bytes memory svgBytes = bytes(svg);
        bytes memory openMarker = bytes('<text class="stat" x="16" y="56"');
        uint256 start = _indexOf(svgBytes, openMarker, 0);
        if (start == type(uint256).max) {
            revert(string.concat("title row missing for ", uuid));
        }

        bytes memory closeMarker = bytes("</text>");
        uint256 end = _indexOf(svgBytes, closeMarker, start);
        if (end == type(uint256).max) {
            revert(string.concat("title row close missing for ", uuid));
        }
        end += closeMarker.length;

        bytes memory row = new bytes(end - start);
        for (uint256 i; i < row.length; ++i) {
            row[i] = svgBytes[start + i];
        }

        return string(row);
    }

    function _upper(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length);

        for (uint256 i; i < input.length; ++i) {
            uint8 charCode = uint8(input[i]);
            if (charCode >= 97 && charCode <= 122) {
                output[i] = bytes1(charCode & 0xdf);
            } else {
                output[i] = input[i];
            }
        }

        return string(output);
    }

    /// @dev Label tables duplicated from BuddyRenderer.sol — intentional per spec (no shared helper).
    function _speciesLabel(uint8 species) internal pure returns (string memory) {
        if (species == 0) return "Duck";
        if (species == 1) return "Goose";
        if (species == 2) return "Blob";
        if (species == 3) return "Cat";
        if (species == 4) return "Dragon";
        if (species == 5) return "Octopus";
        if (species == 6) return "Owl";
        if (species == 7) return "Penguin";
        if (species == 8) return "Turtle";
        if (species == 9) return "Snail";
        if (species == 10) return "Ghost";
        if (species == 11) return "Axolotl";
        if (species == 12) return "Capybara";
        if (species == 13) return "Cactus";
        if (species == 14) return "Robot";
        if (species == 15) return "Rabbit";
        if (species == 16) return "Mushroom";
        if (species == 17) return "Chonk";
        return "Unknown";
    }

    function _rarityLabel(uint8 rarity) internal pure returns (string memory) {
        if (rarity == 0) return "Common";
        if (rarity == 1) return "Uncommon";
        if (rarity == 2) return "Rare";
        if (rarity == 3) return "Epic";
        if (rarity == 4) return "Legendary";
        return "Unknown";
    }

    function _eyeLabel(uint8 eyes) internal pure returns (string memory) {
        if (eyes == 0) return "Dot";
        if (eyes == 1) return "Star";
        if (eyes == 2) return "Cross";
        if (eyes == 3) return "Bullseye";
        if (eyes == 4) return "Spiral";
        if (eyes == 5) return "Ring";
        return "Unknown";
    }

    function _eyeGlyph(uint8 eyes) internal pure returns (string memory) {
        if (eyes == 0) return unicode"·";
        if (eyes == 1) return unicode"✦";
        if (eyes == 2) return unicode"×";
        if (eyes == 3) return unicode"◉";
        if (eyes == 4) return "@";
        if (eyes == 5) return unicode"°";
        return "?";
    }

    function _hatLabel(uint8 hat) internal pure returns (string memory) {
        if (hat == 0) return "None";
        if (hat == 1) return "Crown";
        if (hat == 2) return "Top Hat";
        if (hat == 3) return "Propeller";
        if (hat == 4) return "Halo";
        if (hat == 5) return "Wizard";
        if (hat == 6) return "Beanie";
        if (hat == 7) return "Tiny Duck";
        return "Unknown";
    }
}

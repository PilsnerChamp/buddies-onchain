// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {WyHash} from "../contracts/libraries/WyHash.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {BuddyDomain} from "../contracts/libraries/BuddyDomain.sol";

/// @notice Searches sequential UUIDs for Phase A coverage.
/// @dev Run with `cd onchain && forge script script/FindSpeciesUuids.s.sol -vvvv`.
contract FindSpeciesUuids is Script {
    bytes private constant HATCH_SALT = "friend-2026-401";
    uint256 private constant SEARCH_LIMIT = 10_000;
    uint8 private constant SPECIES_COUNT = BuddyDomain.SPECIES_COUNT;
    uint8 private constant RARITY_COUNT = BuddyDomain.RARITY_COUNT;
    uint8 private constant EYE_COUNT = BuddyDomain.EYE_COUNT;
    uint8 private constant HAT_COUNT = BuddyDomain.HAT_COUNT;
    uint8 private constant NONZERO_HAT_COUNT = HAT_COUNT - 1;

    // Coverage state stored in contract storage to avoid stack depth issues
    mapping(uint8 => bool) private _speciesCovered;
    mapping(uint8 => bool) private _rarityCovered;
    mapping(uint8 => bool) private _eyesCovered;
    mapping(uint8 => bool) private _hatCovered;
    mapping(uint8 => string) private _firstUuidBySpecies;

    uint8 private _speciesFound;
    uint8 private _rarityFound;
    uint8 private _eyesFound;
    uint8 private _hatsFoundNonZero;
    bool private _shinyFound;
    bool private _coverageComplete;
    bool private _duplicateFound;
    uint256 private _coverageAt;

    struct TraitResult {
        uint8 species;
        uint8 rarity;
        uint8 eyes;
        uint8 hat;
        bool shiny;
    }

    function run() external {
        for (uint256 i = 1; i <= SEARCH_LIMIT && !_duplicateFound; ++i) {
            string memory uuid = _buildUuid(i);
            TraitResult memory t = _deriveTraitResult(uuid);
            _processUuid(i, uuid, t);
        }

        console.log("---");
        console.log("Species covered: %d/%d", uint256(_speciesFound), uint256(SPECIES_COUNT));
        console.log("Rarities covered: %d/%d", uint256(_rarityFound), uint256(RARITY_COUNT));
        console.log("Eyes covered: %d/%d", uint256(_eyesFound), uint256(EYE_COUNT));
        console.log("Non-zero hats covered: %d/%d", uint256(_hatsFoundNonZero), uint256(NONZERO_HAT_COUNT));
        console.log("Shiny found: %s", _shinyFound ? "true" : "false");
        console.log("Coverage complete: %s", _coverageComplete ? "true" : "false");
        console.log("Same-species pair logged: %s", _duplicateFound ? "true" : "false");

        if (_coverageComplete) {
            console.log("Coverage reached by UUID #%d", _coverageAt);
        } else {
            console.log("WARNING: Full five-axis coverage not reached in the current search window.");
            console.log("Increase SEARCH_LIMIT and re-run.");
        }

        if (!_duplicateFound) {
            console.log("WARNING: Same-species pair not logged after coverage. Increase SEARCH_LIMIT and re-run.");
        }
    }

    function _deriveTraitResult(string memory uuid) internal pure returns (TraitResult memory) {
        uint32 seed = WyHash.hash(bytes(uuid), HATCH_SALT);
        (uint8 species, uint8 rarity, uint8 eyes, uint8 hat, bool shiny,,,,,) = Mulberry32.deriveTraits(seed);
        return TraitResult({species: species, rarity: rarity, eyes: eyes, hat: hat, shiny: shiny});
    }

    function _processUuid(uint256 i, string memory uuid, TraitResult memory t) internal {
        bool isCoverageUuid;

        if (!_speciesCovered[t.species]) {
            _speciesCovered[t.species] = true;
            _speciesFound++;
            isCoverageUuid = true;
        }
        if (!_rarityCovered[t.rarity]) {
            _rarityCovered[t.rarity] = true;
            _rarityFound++;
            isCoverageUuid = true;
        }
        if (!_eyesCovered[t.eyes]) {
            _eyesCovered[t.eyes] = true;
            _eyesFound++;
            isCoverageUuid = true;
        }
        if (t.hat != 0 && !_hatCovered[t.hat]) {
            _hatCovered[t.hat] = true;
            _hatsFoundNonZero++;
            isCoverageUuid = true;
        }
        if (t.shiny && !_shinyFound) {
            _shinyFound = true;
            isCoverageUuid = true;
        }

        if (t.shiny) {
            console.log(string.concat("SHINY_UUID ", uuid));
        }

        // Evaluate coverage BEFORE duplicate check so the iteration
        // that completes coverage can also log a same-species pair.
        if (!_coverageComplete && _hasFullCoverage()) {
            _coverageComplete = true;
            _coverageAt = i;
            console.log("--- FULL COVERAGE REACHED ---");
            console.log("Coverage hit at UUID #%d", i);
            console.log("Continuing until a same-species pair is logged for A7...");
        }

        if (bytes(_firstUuidBySpecies[t.species]).length == 0) {
            _firstUuidBySpecies[t.species] = uuid;
        } else if (_coverageComplete) {
            _duplicateFound = true;
            console.log("SAME_SPECIES_SPECIES %d", uint256(t.species));
            console.log(string.concat("SAME_SPECIES_FIRST ", _firstUuidBySpecies[t.species]));
            console.log(string.concat("SAME_SPECIES_SECOND ", uuid));
        }

        if (isCoverageUuid) {
            console.log(string.concat("COVERAGE_UUID ", uuid));
            console.log(
                string.concat(
                    "  species=",
                    _u8(t.species),
                    "  rarity=",
                    _u8(t.rarity),
                    "  eyes=",
                    _u8(t.eyes),
                    "  hat=",
                    _u8(t.hat),
                    "  shiny=",
                    t.shiny ? "true" : "false"
                )
            );
        }
    }

    function _hasFullCoverage() internal view returns (bool) {
        return _speciesFound == SPECIES_COUNT && _rarityFound == RARITY_COUNT && _eyesFound == EYE_COUNT
            && _hatsFoundNonZero == NONZERO_HAT_COUNT && _shinyFound;
    }

    function _u8(uint8 v) internal pure returns (string memory) {
        uint8 asciiZero = uint8(BuddyDomain.ASCII_DIGIT_0);
        if (v < 10) return string(abi.encodePacked(bytes1(asciiZero + v)));
        return string(abi.encodePacked(bytes1(asciiZero + v / 10), bytes1(asciiZero + v % 10)));
    }

    /// @dev Builds UUID format: 00000000-0000-4000-8000-{i as 12 lowercase hex}
    function _buildUuid(uint256 i) internal pure returns (string memory) {
        bytes memory suffix = new bytes(12);
        bytes memory hexChars = BuddyDomain.LOWERCASE_HEX_DIGITS;
        for (uint256 j = 12; j > 0; --j) {
            suffix[j - 1] = hexChars[i & 0xf];
            i >>= 4;
        }
        return string(abi.encodePacked("00000000-0000-4000-8000-", suffix));
    }
}

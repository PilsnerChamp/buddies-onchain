// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BuddyDomain} from "../contracts/libraries/BuddyDomain.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {WyHash} from "../contracts/libraries/WyHash.sol";
import {IdentityHash} from "../test/helpers/IdentityHash.sol";

/// @notice Verifies committed hatch-coverage UUID manifest against Solidity derivation.
/// @dev This is the Forge-side `coverage-uuids-check` gate.
contract CheckHatchCoverageUuids is Script {
    string private constant MANIFEST_PATH = "contract-data/hatch-coverage/manifest.json";
    bytes private constant SEED_DOMAIN = "buddies-onchain:trait-seed:v2";

    uint8 private constant SPECIES_COUNT = BuddyDomain.SPECIES_COUNT;
    uint8 private constant RARITY_COUNT = BuddyDomain.RARITY_COUNT;
    uint8 private constant EYE_COUNT = BuddyDomain.EYE_COUNT;
    uint8 private constant HAT_COUNT = BuddyDomain.HAT_COUNT;
    uint8 private constant NONZERO_HAT_COUNT = HAT_COUNT - 1;

    struct ManifestTraits {
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

    struct ManifestRow {
        string uuid;
        uint256 tokenId;
        uint256 seed;
        ManifestTraits traits;
    }

    mapping(uint8 => bool) private _speciesCovered;
    mapping(uint8 => bool) private _rarityCovered;
    mapping(uint8 => bool) private _eyesCovered;
    mapping(uint8 => bool) private _hatCovered;

    uint8 private _speciesFound;
    uint8 private _rarityFound;
    uint8 private _eyesFound;
    uint8 private _hatsFoundNonZero;
    uint256 private _hatlessCount;
    uint256 private _shinyCount;
    uint256 private _nonShinyCount;

    function run() external {
        string memory json = vm.readFile(MANIFEST_PATH);
        uint256 entryCount = _countManifestEntries(json);
        if (entryCount == 0) {
            revert("CheckHatchCoverageUuids: manifest has no UUID entries");
        }

        for (uint256 i; i < entryCount; ++i) {
            ManifestRow memory row = _parseRow(json, i);
            _checkRow(row, i);
        }

        _assertCoverage();

        console.log("HATCH_COVERAGE_UUIDS_OK %d", entryCount);
        console.log("Species covered: %d/%d", uint256(_speciesFound), uint256(SPECIES_COUNT));
        console.log("Rarities covered: %d/%d", uint256(_rarityFound), uint256(RARITY_COUNT));
        console.log("Eyes covered: %d/%d", uint256(_eyesFound), uint256(EYE_COUNT));
        console.log("Non-zero hats covered: %d/%d", uint256(_hatsFoundNonZero), uint256(NONZERO_HAT_COUNT));
        console.log("Hatless UUIDs: %d", _hatlessCount);
        console.log("Shiny UUIDs: %d", _shinyCount);
        console.log("Non-shiny UUIDs: %d", _nonShinyCount);
    }

    function _parseRow(string memory json, uint256 index) internal pure returns (ManifestRow memory row) {
        string memory prefix = string.concat("$[", vm.toString(index), "]");
        string memory traitsPrefix = string.concat(prefix, ".traits");

        row.uuid = vm.parseJsonString(json, string.concat(prefix, ".uuid"));
        row.tokenId = vm.parseJsonUint(json, string.concat(prefix, ".tokenId"));
        row.seed = vm.parseJsonUint(json, string.concat(prefix, ".seed"));
        row.traits = ManifestTraits({
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

    function _checkRow(ManifestRow memory row, uint256 index) internal {
        uint32 seed = WyHash.hash(abi.encodePacked(IdentityHash._computeIdentityHash(row.uuid)), SEED_DOMAIN);

        _assertUintEq(row.uuid, "tokenId", row.tokenId, index + 1);
        _assertUintEq(row.uuid, "seed", row.seed, uint256(seed));
        _assertCoreTraitsAndRecordCoverage(row.uuid, row.traits, seed);
        _assertStatTraits(row.uuid, row.traits, seed);
    }

    function _assertCoreTraitsAndRecordCoverage(string memory uuid, ManifestTraits memory manifest, uint32 seed)
        internal
    {
        (uint8 species, uint8 rarity, uint8 eyes, uint8 hat, bool shiny,,,,,) = Mulberry32.deriveTraits(seed);

        _assertUintEq(uuid, "species", manifest.species, uint256(species));
        _assertUintEq(uuid, "rarity", manifest.rarity, uint256(rarity));
        _assertUintEq(uuid, "eyes", manifest.eyes, uint256(eyes));
        _assertUintEq(uuid, "hat", manifest.hat, uint256(hat));
        _assertBoolEq(uuid, "shiny", manifest.shiny, shiny);

        _recordCoverage(species, rarity, eyes, hat, shiny);
    }

    function _assertStatTraits(string memory uuid, ManifestTraits memory manifest, uint32 seed) internal pure {
        (,,,,, uint8 debugging, uint8 patience, uint8 chaos, uint8 wisdom, uint8 snark) = Mulberry32.deriveTraits(seed);

        _assertUintEq(uuid, "debugging", manifest.debugging, uint256(debugging));
        _assertUintEq(uuid, "patience", manifest.patience, uint256(patience));
        _assertUintEq(uuid, "chaos", manifest.chaos, uint256(chaos));
        _assertUintEq(uuid, "wisdom", manifest.wisdom, uint256(wisdom));
        _assertUintEq(uuid, "snark", manifest.snark, uint256(snark));
    }

    function _recordCoverage(uint8 species, uint8 rarity, uint8 eyes, uint8 hat, bool shiny) internal {
        if (!_speciesCovered[species]) {
            _speciesCovered[species] = true;
            _speciesFound++;
        }
        if (!_rarityCovered[rarity]) {
            _rarityCovered[rarity] = true;
            _rarityFound++;
        }
        if (!_eyesCovered[eyes]) {
            _eyesCovered[eyes] = true;
            _eyesFound++;
        }
        if (hat == 0) {
            _hatlessCount++;
        } else if (!_hatCovered[hat]) {
            _hatCovered[hat] = true;
            _hatsFoundNonZero++;
        }
        if (shiny) {
            _shinyCount++;
        } else {
            _nonShinyCount++;
        }
    }

    function _assertCoverage() internal view {
        for (uint8 i; i < SPECIES_COUNT; ++i) {
            if (!_speciesCovered[i]) {
                revert(string.concat("CheckHatchCoverageUuids: missing species ", vm.toString(uint256(i))));
            }
        }
        for (uint8 i; i < RARITY_COUNT; ++i) {
            if (!_rarityCovered[i]) {
                revert(string.concat("CheckHatchCoverageUuids: missing rarity ", vm.toString(uint256(i))));
            }
        }
        for (uint8 i; i < EYE_COUNT; ++i) {
            if (!_eyesCovered[i]) {
                revert(string.concat("CheckHatchCoverageUuids: missing eyes ", vm.toString(uint256(i))));
            }
        }
        for (uint8 i = 1; i < HAT_COUNT; ++i) {
            if (!_hatCovered[i]) {
                revert(string.concat("CheckHatchCoverageUuids: missing non-zero hat ", vm.toString(uint256(i))));
            }
        }
        if (_hatsFoundNonZero != NONZERO_HAT_COUNT) {
            revert("CheckHatchCoverageUuids: non-zero hat coverage count mismatch");
        }
        if (_hatlessCount == 0) {
            revert("CheckHatchCoverageUuids: missing hatless UUID");
        }
        if (_shinyCount == 0) {
            revert("CheckHatchCoverageUuids: missing shiny UUID");
        }
        if (_nonShinyCount == 0) {
            revert("CheckHatchCoverageUuids: missing non-shiny UUID");
        }
    }

    function _assertUintEq(string memory uuid, string memory field, uint256 manifestValue, uint256 derivedValue)
        internal
        pure
    {
        if (manifestValue != derivedValue) {
            revert(
                string.concat(
                    "CheckHatchCoverageUuids: ",
                    field,
                    " mismatch for ",
                    uuid,
                    " manifest=",
                    vm.toString(manifestValue),
                    " derived=",
                    vm.toString(derivedValue)
                )
            );
        }
    }

    function _assertBoolEq(string memory uuid, string memory field, bool manifestValue, bool derivedValue)
        internal
        pure
    {
        if (manifestValue != derivedValue) {
            revert(
                string.concat(
                    "CheckHatchCoverageUuids: ",
                    field,
                    " mismatch for ",
                    uuid,
                    " manifest=",
                    manifestValue ? "true" : "false",
                    " derived=",
                    derivedValue ? "true" : "false"
                )
            );
        }
    }

    function _countManifestEntries(string memory json) internal pure returns (uint256 count) {
        bytes memory data = bytes(json);
        bool foundArrayStart;
        for (uint256 i; i < data.length; ++i) {
            bytes1 c = data[i];
            if (c == 0x20 || c == 0x0a || c == 0x0d || c == 0x09) {
                continue;
            }
            if (c != 0x5b) {
                revert("CheckHatchCoverageUuids: manifest must be a top-level array");
            }
            foundArrayStart = true;
            break;
        }
        if (!foundArrayStart) {
            return 0;
        }

        bytes memory needle = '"uuid"';
        for (uint256 i; i + needle.length <= data.length; ++i) {
            if (_matchesAt(data, needle, i)) {
                count++;
                i += needle.length - 1;
            }
        }
    }

    function _matchesAt(bytes memory data, bytes memory needle, uint256 offset) internal pure returns (bool) {
        for (uint256 i; i < needle.length; ++i) {
            if (data[offset + i] != needle[i]) {
                return false;
            }
        }
        return true;
    }
}

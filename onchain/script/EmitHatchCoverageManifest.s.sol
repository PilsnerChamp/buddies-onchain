// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {WyHash} from "../contracts/libraries/WyHash.sol";

/// @notice Emits seed and trait rows for a shell-provided canonical UUID list.
/// @dev Expects `HATCH_COVERAGE_UUIDS` as a comma-delimited UUID list.
contract EmitHatchCoverageManifest is Script {
    bytes private constant SALT = "friend-2026-401";

    function run() external view {
        string memory rawUuids = vm.envString("HATCH_COVERAGE_UUIDS");
        string[] memory uuids = vm.split(rawUuids, ",");

        if (uuids.length == 0 || bytes(uuids[0]).length == 0) {
            revert("EmitHatchCoverageManifest: HATCH_COVERAGE_UUIDS is empty");
        }

        for (uint256 i; i < uuids.length; ++i) {
            if (bytes(uuids[i]).length == 0) {
                revert("EmitHatchCoverageManifest: empty UUID entry");
            }
            _emitManifestRow(uuids[i], i + 1);
        }
    }

    function _emitManifestRow(string memory uuid, uint256 tokenId) internal pure {
        uint32 seed = WyHash.hash(bytes(uuid), SALT);
        (
            uint8 species,
            uint8 rarity,
            uint8 eyes,
            uint8 hat,
            bool shiny,
            uint8 debugging,
            uint8 patience,
            uint8 chaos,
            uint8 wisdom,
            uint8 snark
        ) = Mulberry32.deriveTraits(seed);

        string memory prefix = string.concat(
            "MANIFEST_ROW ",
            uuid,
            "|",
            vm.toString(tokenId),
            "|",
            vm.toString(uint256(seed)),
            "|",
            vm.toString(uint256(species)),
            "|",
            vm.toString(uint256(rarity))
        );
        string memory middle = string.concat(
            "|",
            vm.toString(uint256(eyes)),
            "|",
            vm.toString(uint256(hat)),
            "|",
            shiny ? "true" : "false",
            "|",
            vm.toString(uint256(debugging)),
            "|",
            vm.toString(uint256(patience))
        );
        string memory suffix = string.concat(
            "|", vm.toString(uint256(chaos)), "|", vm.toString(uint256(wisdom)), "|", vm.toString(uint256(snark))
        );

        console.log(string.concat(prefix, middle, suffix));
    }
}

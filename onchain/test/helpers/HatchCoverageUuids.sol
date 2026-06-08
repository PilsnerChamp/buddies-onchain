// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Canonical UUID list for hatch-coverage fixtures.
/// @notice Populated by `onchain/tools/renderer/regen-hatch-coverage-uuids.sh`.
/// @dev Companion manifest lives at
///      `onchain/contract-data/hatch-coverage/manifest.json`.
///      For each UUID in this array, the manifest records:
///      - `tokenId`: canonical array index + 1.
///      - `seed`: `WyHash.hash(bytes(uuid), bytes("friend-2026-401"))`, equal to
///        `BuddyNFT.buddyPrngSeed(tokenId)`.
///      - Full `BuddyTraits`: `species`, `rarity`, `eyes`, `hat`, `shiny`,
///        `debugging`, `patience`, `chaos`, `wisdom`, and `snark`.
///      Canonical UUID order is this array order; reordering is a fixture change.
contract HatchCoverageUuids {
    /// @notice Returns hatch-coverage UUIDs in canonical fixture order.
    function hatchCoverageUuids() internal pure returns (string[] memory) {
        string[] memory uuids = new string[](22);
        uuids[0] = "00000000-0000-4000-8000-000000000001";
        uuids[1] = "00000000-0000-4000-8000-000000000002";
        uuids[2] = "00000000-0000-4000-8000-000000000003";
        uuids[3] = "00000000-0000-4000-8000-000000000004";
        uuids[4] = "00000000-0000-4000-8000-000000000005";
        uuids[5] = "00000000-0000-4000-8000-000000000006";
        uuids[6] = "00000000-0000-4000-8000-000000000007";
        uuids[7] = "00000000-0000-4000-8000-000000000009";
        uuids[8] = "00000000-0000-4000-8000-00000000000a";
        uuids[9] = "00000000-0000-4000-8000-00000000000b";
        uuids[10] = "00000000-0000-4000-8000-00000000000c";
        uuids[11] = "00000000-0000-4000-8000-00000000000e";
        uuids[12] = "00000000-0000-4000-8000-00000000000f";
        uuids[13] = "00000000-0000-4000-8000-000000000010";
        uuids[14] = "00000000-0000-4000-8000-000000000011";
        uuids[15] = "00000000-0000-4000-8000-000000000012";
        uuids[16] = "00000000-0000-4000-8000-000000000015";
        uuids[17] = "00000000-0000-4000-8000-000000000016";
        uuids[18] = "00000000-0000-4000-8000-00000000001a";
        uuids[19] = "00000000-0000-4000-8000-00000000001d";
        uuids[20] = "00000000-0000-4000-8000-000000000026";
        uuids[21] = "00000000-0000-4000-8000-0000000000f1";
        return uuids;
    }
}

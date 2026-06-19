// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {HatchHelper} from "../test/helpers/HatchHelper.sol";

/// @title DeriveHatchArgs
/// @notice Off-chain (local, no chain reads) derivation of the hatch args for a UUID:
///         identityHash = keccak("buddies-onchain:identity:claude:v1" | 0x1f | uuid),
///         honest prngSeed = WyHash(uuid, "friend-2026-401"). Reuses the exact
///         HatchHelper path the contract + fork tests use, so values byte-match what
///         BuddyNFT.hatch() expects. Prints a squat seed (honest ^ 0x5eed) for the
///         squat fixtures. Pure compute — never broadcasts, never reads chain state.
/// @dev    Run: forge script script/DeriveHatchArgs.s.sol:DeriveHatchArgs
contract DeriveHatchArgs is Script, HatchHelper {
    function run() external pure {
        string[3] memory uuids = [
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333"
        ];
        for (uint256 i = 0; i < uuids.length; i++) {
            bytes32 idh = _identityHash(uuids[i]);
            uint32 honest = _prngSeed(uuids[i]);
            console.log("uuid        :", uuids[i]);
            console.log("  identityHash:");
            console.logBytes32(idh);
            console.log("  honestSeed  :", uint256(honest));
            console.log("  squatSeed   :", uint256(honest ^ 0x5eed));
            console.log("");
        }
    }
}

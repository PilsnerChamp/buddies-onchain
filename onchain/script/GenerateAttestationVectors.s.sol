// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {ClaimAttestationHelper} from "../test/helpers/ClaimAttestationHelper.sol";
import {HatchHelper} from "../test/helpers/HatchHelper.sol";

/// @title GenerateAttestationVectors
/// @notice Local-only generator for `test/vectors/attestation-digest-vectors.json`.
///         Prints the canonical EIP-712 ClaimAttestation typehash, the pinned-domain
///         separator, and per-vector structHash + digest values that the JSON fixture
///         pins. Re-run after ANY change to the attestation preimage and re-pin the
///         fixture (do NOT hand-edit the JSON).
/// @dev    Run (no RPC, no broadcast — pure local computation):
///           forge script script/GenerateAttestationVectors.s.sol:GenerateAttestationVectors -vv
///         Vector inputs MUST stay in lockstep with the JSON file, with
///         AttestationDigestVectors.t.sol (recomputes everything; catches transcription
///         drift), and with the TS-side parity test plugin/test/attestation-digest-parity.test.ts
///         (the JSON is a cross-stack contract — field names are stable + self-describing).
contract GenerateAttestationVectors is Script, HatchHelper {
    // Pinned synthetic domain: Base Sepolia chainId + a fixed verifying contract.
    uint256 internal constant CHAIN_ID = 84532;
    address internal constant VERIFYING_CONTRACT = 0x1111111111111111111111111111111111111111;

    string internal constant UUID_PRIMARY = "550e8400-e29b-41d4-a716-446655440000";

    function run() external pure {
        console.log("=== typehash ===");
        console.logBytes32(ClaimAttestationHelper.TYPEHASH);

        console.log("=== domainSeparator (84532, 0x1111...1111) ===");
        console.logBytes32(ClaimAttestationHelper.domainSeparatorFor(CHAIN_ID, VERIFYING_CONTRACT));

        // Canonical derivation via HatchHelper — salt cannot drift from the
        // hatch-path source of truth.
        uint32 derivedPrimary = _prngSeed(UUID_PRIMARY);
        console.log("=== derived seed (primary uuid) ===");
        console.log(derivedPrimary);

        // Vector 0: derived seed, named claim, claude provider.
        _claimVector(
            0x3fea5f748f6f8e6f37b83f3ea59e19cd0b21b89ead53b08fe2d539135af227dd,
            derivedPrimary,
            "claude",
            "Pilsner",
            address(0xA1),
            1765432100
        );
        // Vector 1: zero seed, empty name (nameless claim), codex provider.
        _claimVector(
            0x948cfab60f879cf5e5dea9fe837663223d2179ca342b3884fb5f402effcb0b03,
            0,
            "codex",
            "",
            address(0xB2),
            4102444800
        );
        // Vector 2: max uint32 seed, full-width 14-byte name, hyphenated provider.
        _claimVector(
            0x0d2c97ee5a5d65c72c29da94fc24fa254a51780d33c8e6d7b888574df2377a9b,
            4294967295,
            "a-b-c-d-e-f-0123",
            "fourteen-chars",
            address(0xC3),
            2000000000
        );
    }

    function _claimVector(
        bytes32 identityHash,
        uint32 prngSeed,
        bytes16 provider,
        string memory name,
        address recipient,
        uint64 expiry
    ) internal pure {
        BuddyNFT.ClaimAttestation memory att = BuddyNFT.ClaimAttestation({
            identityHash: identityHash,
            prngSeed: prngSeed,
            provider: provider,
            name: name,
            recipient: recipient,
            expiry: expiry
        });
        console.log("=== claim vector: name ===");
        console.log(name);
        console.logBytes32(ClaimAttestationHelper.hashStruct(att));
        console.logBytes32(ClaimAttestationHelper.digestFor(CHAIN_ID, VERIFYING_CONTRACT, att));
    }
}

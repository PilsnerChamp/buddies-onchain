// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BondAttestationHelper} from "../test/helpers/BondAttestationHelper.sol";
import {ReclaimAttestationHelper} from "../test/helpers/ReclaimAttestationHelper.sol";
import {HatchHelper} from "../test/helpers/HatchHelper.sol";

/// @title GenerateAttestationVectors
/// @notice Local-only generator for `test/vectors/attestation-digest-vectors.json`.
///         Prints the canonical EIP-712 typehashes, the pinned-domain separator, and
///         per-vector structHash + digest values that the JSON fixture pins. Re-run
///         after ANY change to the attestation preimages and re-pin the fixture.
/// @dev    Run (no RPC, no broadcast — pure local computation):
///           forge script script/GenerateAttestationVectors.s.sol:GenerateAttestationVectors -vv
///         Vector inputs MUST stay in lockstep with the JSON file and with
///         AttestationDigestVectors.t.sol, which recomputes everything and catches
///         any transcription drift.
contract GenerateAttestationVectors is Script, HatchHelper {
    // Pinned synthetic domain: Base Sepolia chainId + a fixed verifying contract.
    uint256 internal constant CHAIN_ID = 84532;
    address internal constant VERIFYING_CONTRACT = 0x1111111111111111111111111111111111111111;

    string internal constant UUID_PRIMARY = "550e8400-e29b-41d4-a716-446655440000";

    function run() external pure {
        console.log("=== typehashes ===");
        console.logBytes32(BondAttestationHelper.TYPEHASH);
        console.logBytes32(ReclaimAttestationHelper.TYPEHASH);

        console.log("=== domainSeparator (84532, 0x1111...1111) ===");
        console.logBytes32(BondAttestationHelper.domainSeparatorFor(CHAIN_ID, VERIFYING_CONTRACT));

        // Canonical derivation via HatchHelper — salt cannot drift from the
        // hatch-path source of truth.
        uint32 derivedPrimary = _prngSeed(UUID_PRIMARY);
        console.log("=== derived seed (primary uuid) ===");
        console.log(derivedPrimary);

        _bondVector(
            1,
            0x3fea5f748f6f8e6f37b83f3ea59e19cd0b21b89ead53b08fe2d539135af227dd,
            derivedPrimary,
            address(0xA1),
            1765432100
        );
        _bondVector(
            42, 0x948cfab60f879cf5e5dea9fe837663223d2179ca342b3884fb5f402effcb0b03, 0, address(0xB2), 4102444800
        );
        _bondVector(
            7777777,
            0x0d2c97ee5a5d65c72c29da94fc24fa254a51780d33c8e6d7b888574df2377a9b,
            4294967295,
            address(0xC3),
            2000000000
        );

        _reclaimVector(
            1,
            0x3fea5f748f6f8e6f37b83f3ea59e19cd0b21b89ead53b08fe2d539135af227dd,
            derivedPrimary,
            "claude",
            address(0xA1),
            1765432100
        );
        _reclaimVector(
            42,
            0x948cfab60f879cf5e5dea9fe837663223d2179ca342b3884fb5f402effcb0b03,
            0,
            "codex",
            address(0xB2),
            4102444800
        );
        _reclaimVector(
            7777777,
            0x0d2c97ee5a5d65c72c29da94fc24fa254a51780d33c8e6d7b888574df2377a9b,
            4294967295,
            "a-b-c-d-e-f-0123",
            address(0xC3),
            2000000000
        );
    }

    function _bondVector(uint256 tokenId, bytes32 identityHash, uint32 prngSeed, address recipient, uint64 expiry)
        internal
        pure
    {
        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId, identityHash: identityHash, prngSeed: prngSeed, recipient: recipient, expiry: expiry
        });
        console.log("=== bond vector: tokenId ===");
        console.log(tokenId);
        console.logBytes32(BondAttestationHelper.hashStruct(att));
        console.logBytes32(BondAttestationHelper.digestFor(CHAIN_ID, VERIFYING_CONTRACT, att));
    }

    function _reclaimVector(
        uint256 tokenId,
        bytes32 identityHash,
        uint32 prngSeed,
        bytes16 provider,
        address reclaimer,
        uint64 expiry
    ) internal pure {
        BuddyNFT.ReclaimAttestation memory att = BuddyNFT.ReclaimAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            prngSeed: prngSeed,
            provider: provider,
            reclaimer: reclaimer,
            expiry: expiry
        });
        console.log("=== reclaim vector: tokenId ===");
        console.log(tokenId);
        console.logBytes32(ReclaimAttestationHelper.hashStruct(att));
        console.logBytes32(ReclaimAttestationHelper.digestFor(CHAIN_ID, VERIFYING_CONTRACT, att));
    }
}

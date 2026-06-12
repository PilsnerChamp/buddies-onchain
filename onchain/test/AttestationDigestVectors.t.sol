// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BondAttestationHelper} from "./helpers/BondAttestationHelper.sol";
import {ReclaimAttestationHelper} from "./helpers/ReclaimAttestationHelper.sol";

/// @title AttestationDigestVectorsTest
/// @notice Golden-vector parity pins for the BondAttestation + ReclaimAttestation
///         EIP-712 preimages. The JSON fixture is the durable cross-domain contract
///         for any future off-chain signing service: a TS consumer reproducing these
///         typehashes/structHashes/digests matches the deployed preimage byte-exact.
/// @dev    Chain of custody: this suite pins helper == fixture; the bond/reclaim
///         suites pin helper == contract (helper-signed attestations are accepted
///         on-chain), so fixture == contract transitively. Regenerate values with
///         script/GenerateAttestationVectors.s.sol after any preimage change.
contract AttestationDigestVectorsTest is Test {
    using stdJson for string;

    string internal constant VECTORS_PATH = "test/vectors/attestation-digest-vectors.json";

    string internal json;
    uint256 internal chainId;
    address internal verifyingContract;

    function setUp() public {
        json = vm.readFile(VECTORS_PATH);
        chainId = json.readUint(".domain.chainId");
        verifyingContract = json.readAddress(".domain.verifyingContract");
    }

    function test_domain_matchesVectors() public view {
        // Name/version are hardcoded in the helper's domain hash; the fixture must
        // declare the same pair the contract constructor passes to EIP712().
        assertEq(json.readString(".domain.name"), "BuddyNFT", "domain name drift");
        assertEq(json.readString(".domain.version"), "1", "domain version drift");
        assertEq(
            BondAttestationHelper.domainSeparatorFor(chainId, verifyingContract),
            json.readBytes32(".domain.separator"),
            "domain separator mismatch"
        );
    }

    function test_bondTypehash_matchesVectors() public view {
        string memory typeString = json.readString(".bondAttestation.typeString");
        bytes32 typehash = json.readBytes32(".bondAttestation.typehash");

        assertEq(keccak256(bytes(typeString)), typehash, "bond typeString does not hash to pinned typehash");
        assertEq(BondAttestationHelper.TYPEHASH, typehash, "helper bond typehash drift from fixture");
    }

    function test_reclaimTypehash_matchesVectors() public view {
        string memory typeString = json.readString(".reclaimAttestation.typeString");
        bytes32 typehash = json.readBytes32(".reclaimAttestation.typehash");

        assertEq(keccak256(bytes(typeString)), typehash, "reclaim typeString does not hash to pinned typehash");
        assertEq(ReclaimAttestationHelper.TYPEHASH, typehash, "helper reclaim typehash drift from fixture");
    }

    function test_bondVectors_structHashAndDigest() public view {
        uint256 vectorCount = json.readUint(".bondAttestation.vectorCount");
        require(vectorCount > 0, "bond vectors missing");

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".bondAttestation.vectors[", vm.toString(i), "]");

            BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
                tokenId: json.readUint(string.concat(prefix, ".tokenId")),
                identityHash: json.readBytes32(string.concat(prefix, ".identityHash")),
                // forge-lint: disable-next-line(unsafe-typecast)
                prngSeed: uint32(json.readUint(string.concat(prefix, ".prngSeed"))),
                recipient: json.readAddress(string.concat(prefix, ".recipient")),
                // forge-lint: disable-next-line(unsafe-typecast)
                expiry: uint64(json.readUint(string.concat(prefix, ".expiry")))
            });

            assertEq(
                BondAttestationHelper.hashStruct(att),
                json.readBytes32(string.concat(prefix, ".structHash")),
                string.concat("bond structHash mismatch at ", prefix)
            );
            assertEq(
                BondAttestationHelper.digestFor(chainId, verifyingContract, att),
                json.readBytes32(string.concat(prefix, ".digest")),
                string.concat("bond digest mismatch at ", prefix)
            );
        }
    }

    function test_reclaimVectors_structHashAndDigest() public view {
        uint256 vectorCount = json.readUint(".reclaimAttestation.vectorCount");
        require(vectorCount > 0, "reclaim vectors missing");

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".reclaimAttestation.vectors[", vm.toString(i), "]");

            bytes32 providerWord = json.readBytes32(string.concat(prefix, ".providerHex32"));
            bytes16 provider = bytes16(providerWord);
            // providerHex32 must be exactly bytes32(provider): bytes16 label
            // left-aligned, zero tail — the shape abi.encode hashes.
            assertEq(bytes32(provider), providerWord, "providerHex32 carries data beyond bytes16");
            // And it must spell the ascii label.
            assertEq(
                provider,
                bytes16(bytes(json.readString(string.concat(prefix, ".provider")))),
                "providerHex32 does not spell the ascii provider label"
            );

            BuddyNFT.ReclaimAttestation memory att = BuddyNFT.ReclaimAttestation({
                tokenId: json.readUint(string.concat(prefix, ".tokenId")),
                identityHash: json.readBytes32(string.concat(prefix, ".identityHash")),
                // forge-lint: disable-next-line(unsafe-typecast)
                prngSeed: uint32(json.readUint(string.concat(prefix, ".prngSeed"))),
                provider: provider,
                reclaimer: json.readAddress(string.concat(prefix, ".reclaimer")),
                // forge-lint: disable-next-line(unsafe-typecast)
                expiry: uint64(json.readUint(string.concat(prefix, ".expiry")))
            });

            assertEq(
                ReclaimAttestationHelper.hashStruct(att),
                json.readBytes32(string.concat(prefix, ".structHash")),
                string.concat("reclaim structHash mismatch at ", prefix)
            );
            assertEq(
                ReclaimAttestationHelper.digestFor(chainId, verifyingContract, att),
                json.readBytes32(string.concat(prefix, ".digest")),
                string.concat("reclaim digest mismatch at ", prefix)
            );
        }
    }
}

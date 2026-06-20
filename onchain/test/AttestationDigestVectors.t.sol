// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {ClaimAttestationHelper} from "./helpers/ClaimAttestationHelper.sol";

/// @title AttestationDigestVectorsTest
/// @notice Golden-vector parity pins for the ClaimAttestation EIP-712 preimage — the
///         single Stage-2 attestation (supersedes the old Bond/Reclaim vectors). The
///         JSON fixture is the durable cross-stack contract for the off-chain signing
///         service + the TS parity test: a consumer reproducing this
///         typehash/structHash/digest matches the deployed preimage byte-exact.
/// @dev    Chain of custody: this suite pins helper == fixture; the claim suites pin
///         helper == contract (helper-signed attestations are accepted on-chain), so
///         fixture == contract transitively. The `name` field is hashed as
///         keccak256(bytes(name)) (NOT the raw dynamic string) per EIP-712; the
///         nameHash column makes that explicit for the TS consumer. Regenerate values
///         with script/GenerateAttestationVectors.s.sol after any preimage change.
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
            ClaimAttestationHelper.domainSeparatorFor(chainId, verifyingContract),
            json.readBytes32(".domain.separator"),
            "domain separator mismatch"
        );
    }

    function test_claimTypehash_matchesVectors() public view {
        string memory typeString = json.readString(".claimAttestation.typeString");
        bytes32 typehash = json.readBytes32(".claimAttestation.typehash");

        assertEq(keccak256(bytes(typeString)), typehash, "claim typeString does not hash to pinned typehash");
        assertEq(ClaimAttestationHelper.TYPEHASH, typehash, "helper claim typehash drift from fixture");
    }

    function test_claimVectors_structHashAndDigest() public view {
        uint256 vectorCount = json.readUint(".claimAttestation.vectorCount");
        require(vectorCount > 0, "claim vectors missing");

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".claimAttestation.vectors[", vm.toString(i), "]");

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

            // nameHash must be keccak256(utf8Bytes(name)) — the shape the struct hash
            // encodes (EIP-712 dynamic string).
            string memory name = json.readString(string.concat(prefix, ".name"));
            assertEq(
                keccak256(bytes(name)),
                json.readBytes32(string.concat(prefix, ".nameHash")),
                string.concat("nameHash != keccak256(name) at ", prefix)
            );

            BuddyNFT.ClaimAttestation memory att = BuddyNFT.ClaimAttestation({
                identityHash: json.readBytes32(string.concat(prefix, ".identityHash")),
                // forge-lint: disable-next-line(unsafe-typecast)
                prngSeed: uint32(json.readUint(string.concat(prefix, ".prngSeed"))),
                provider: provider,
                name: name,
                recipient: json.readAddress(string.concat(prefix, ".recipient")),
                // forge-lint: disable-next-line(unsafe-typecast)
                expiry: uint64(json.readUint(string.concat(prefix, ".expiry")))
            });

            assertEq(
                ClaimAttestationHelper.hashStruct(att),
                json.readBytes32(string.concat(prefix, ".structHash")),
                string.concat("claim structHash mismatch at ", prefix)
            );
            assertEq(
                ClaimAttestationHelper.digestFor(chainId, verifyingContract, att),
                json.readBytes32(string.concat(prefix, ".digest")),
                string.concat("claim digest mismatch at ", prefix)
            );
        }
    }
}

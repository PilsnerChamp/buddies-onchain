// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";

/// @title ClaimAttestationHelper
/// @notice Canonical EIP-712 helpers for BuddyNFT.ClaimAttestation signing — the
///         single Stage-2 attestation, superseding the old Bond/Reclaim helpers.
/// @dev Single source of truth for typehash + domain + struct hash construction
///      across the claim test suites. The `name` field is hashed as
///      `keccak256(bytes(name))` (NOT the raw dynamic string) per EIP-712, matching
///      the contract preimage byte-exact. Per-suite signing stays inline because it
///      needs the `vm.sign` cheatcode bound to a Test contract.
library ClaimAttestationHelper {
    bytes32 internal constant TYPEHASH = keccak256(
        "ClaimAttestation(bytes32 identityHash,uint32 prngSeed,bytes16 provider,string name,address recipient,uint64 expiry)"
    );

    /// @dev Domain separator for the canonical (current chain, target contract) pair.
    function domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return domainSeparatorFor(block.chainid, verifyingContract);
    }

    /// @dev Domain separator for an arbitrary (chain, contract) pair — used by
    ///      cross-chain replay protection tests.
    function domainSeparatorFor(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("BuddyNFT"),
                keccak256("1"),
                chainId,
                verifyingContract
            )
        );
    }

    function hashStruct(BuddyNFT.ClaimAttestation memory attestation) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPEHASH,
                attestation.identityHash,
                attestation.prngSeed,
                attestation.provider,
                keccak256(bytes(attestation.name)),
                attestation.recipient,
                attestation.expiry
            )
        );
    }

    function digest(address verifyingContract, BuddyNFT.ClaimAttestation memory attestation)
        internal
        view
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(domainSeparator(verifyingContract), hashStruct(attestation));
    }

    function digestFor(uint256 chainId, address verifyingContract, BuddyNFT.ClaimAttestation memory attestation)
        internal
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(domainSeparatorFor(chainId, verifyingContract), hashStruct(attestation));
    }
}

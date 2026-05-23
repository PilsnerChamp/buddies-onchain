// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";

/// @title BondAttestationHelper
/// @notice Canonical EIP-712 helpers for BuddyNFT.BondAttestation signing.
/// @dev Single source of truth for typehash + domain + struct hash construction
///      across the bond test suites. Per-suite signing stays inline because it
///      needs the `vm.sign` cheatcode bound to a Test contract.
library BondAttestationHelper {
    bytes32 internal constant TYPEHASH =
        keccak256("BondAttestation(uint256 tokenId,bytes32 identityHash,address recipient,uint64 expiry)");

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

    function hashStruct(BuddyNFT.BondAttestation memory attestation) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPEHASH, attestation.tokenId, attestation.identityHash, attestation.recipient, attestation.expiry
            )
        );
    }

    function digest(address verifyingContract, BuddyNFT.BondAttestation memory attestation)
        internal
        view
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(domainSeparator(verifyingContract), hashStruct(attestation));
    }

    function digestFor(uint256 chainId, address verifyingContract, BuddyNFT.BondAttestation memory attestation)
        internal
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(domainSeparatorFor(chainId, verifyingContract), hashStruct(attestation));
    }
}

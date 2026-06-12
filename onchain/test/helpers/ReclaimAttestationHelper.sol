// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {BondAttestationHelper} from "./BondAttestationHelper.sol";

/// @title ReclaimAttestationHelper
/// @notice Canonical EIP-712 helpers for BuddyNFT.ReclaimAttestation signing.
/// @dev Mirrors BondAttestationHelper (and reuses its EIP-712 domain, which is
///      shared contract-wide) for the distinct ReclaimAttestation typehash.
///      Per-suite signing stays inline because it needs the `vm.sign` cheatcode
///      bound to a Test contract.
library ReclaimAttestationHelper {
    bytes32 internal constant TYPEHASH = keccak256(
        "ReclaimAttestation(uint256 tokenId,bytes32 identityHash,uint32 prngSeed,bytes16 provider,address reclaimer,uint64 expiry)"
    );

    function hashStruct(BuddyNFT.ReclaimAttestation memory attestation) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TYPEHASH,
                attestation.tokenId,
                attestation.identityHash,
                attestation.prngSeed,
                attestation.provider,
                attestation.reclaimer,
                attestation.expiry
            )
        );
    }

    function digest(address verifyingContract, BuddyNFT.ReclaimAttestation memory attestation)
        internal
        view
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(
            BondAttestationHelper.domainSeparator(verifyingContract), hashStruct(attestation)
        );
    }

    function digestFor(uint256 chainId, address verifyingContract, BuddyNFT.ReclaimAttestation memory attestation)
        internal
        pure
        returns (bytes32)
    {
        return MessageHashUtils.toTypedDataHash(
            BondAttestationHelper.domainSeparatorFor(chainId, verifyingContract), hashStruct(attestation)
        );
    }
}

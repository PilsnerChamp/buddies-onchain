// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IdentityHash
/// @notice Test-only anchor for the hash-only hatch identity-hash preimage.
library IdentityHash {
    function _computeIdentityHash(string memory uuidLower) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("buddies-onchain:identity:v1", bytes1(0x1f), uuidLower));
    }
}

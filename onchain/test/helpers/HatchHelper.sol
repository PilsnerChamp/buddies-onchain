// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {WyHash} from "../../contracts/libraries/WyHash.sol";
import {IdentityHash} from "./IdentityHash.sol";

/// @title HatchHelper
/// @notice Shared test helper that keeps UUID-readable tests on the hash-only hatch path.
abstract contract HatchHelper {
    bytes internal constant HATCH_SALT = "friend-2026-401";

    /// @dev v1 plugin provider label; null-padded to bytes16 by the literal cast.
    bytes16 internal constant CLAUDE_PROVIDER = "claude";

    function _identityHash(string memory uuidLower) internal pure returns (bytes32) {
        return IdentityHash._computeIdentityHash(uuidLower);
    }

    function _prngSeed(string memory uuidLower) internal pure returns (uint32) {
        return WyHash.hash(bytes(uuidLower), HATCH_SALT);
    }

    function _hatchUuid(BuddyNFT nft, string memory uuidLower) internal returns (uint256 tokenId) {
        return nft.hatch(_identityHash(uuidLower), _prngSeed(uuidLower), CLAUDE_PROVIDER);
    }
}

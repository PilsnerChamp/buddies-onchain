// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {IdentityHash} from "./IdentityHash.sol";

/// @title HatchHelper
/// @notice Shared test helper that keeps UUID-readable tests on the hash-only hatch path.
abstract contract HatchHelper {
    function _identityHash(string memory uuidLower) internal pure returns (bytes32) {
        return IdentityHash._computeIdentityHash(uuidLower);
    }

    function _hatchUuid(BuddyNFT nft, string memory uuidLower) internal returns (uint256 tokenId) {
        return nft.hatch(_identityHash(uuidLower));
    }
}

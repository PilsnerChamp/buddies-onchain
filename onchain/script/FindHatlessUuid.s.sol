// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BuddyDomain} from "../contracts/libraries/BuddyDomain.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {WyHash} from "../contracts/libraries/WyHash.sol";

/// @notice Finds the first sequential UUID in the canonical search window with hat == 0.
/// @dev Run with `cd onchain && forge script script/FindHatlessUuid.s.sol -vvvv`.
contract FindHatlessUuid is Script {
    bytes private constant HATCH_SALT = "friend-2026-401";
    uint256 private constant SEARCH_LIMIT = 10_000;

    function run() external pure {
        for (uint256 i = 1; i <= SEARCH_LIMIT; ++i) {
            string memory uuid = _buildUuid(i);
            uint32 seed = WyHash.hash(bytes(uuid), HATCH_SALT);
            (,,, uint8 hat,,,,,,) = Mulberry32.deriveTraits(seed);

            if (hat == 0) {
                console.log(string.concat("HATLESS_UUID ", uuid));
                return;
            }
        }

        revert("FindHatlessUuid: no hatless UUID found within SEARCH_LIMIT");
    }

    /// @dev Builds UUID format: 00000000-0000-4000-8000-{i as 12 lowercase hex}
    function _buildUuid(uint256 i) internal pure returns (string memory) {
        bytes memory suffix = new bytes(12);
        bytes memory hexChars = BuddyDomain.LOWERCASE_HEX_DIGITS;
        for (uint256 j = 12; j > 0; --j) {
            suffix[j - 1] = hexChars[i & 0xf];
            i >>= 4;
        }
        return string(abi.encodePacked("00000000-0000-4000-8000-", suffix));
    }
}

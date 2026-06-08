// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {IdentityHash} from "./helpers/IdentityHash.sol";

/// @title IdentityHashVectorsTest
/// @notice Golden-vector parity tests for the hash-only hatch identity hash.
/// @dev The helper is a test anchor only. It expects the already-lowercased
///      canonical UUID form that later callers will pass after validation.
contract IdentityHashVectorsTest is Test {
    string internal constant PRIMARY_UUID = "550e8400-e29b-41d4-a716-446655440000";
    string internal constant PRIMARY_UUID_UPPER = "550E8400-E29B-41D4-A716-446655440000";

    function test_computeIdentityHash_matchesVectors() public view {
        string memory json = vm.readFile("test/vectors/identity-hash-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".vectorCount"), (uint256));

        require(vectorCount > 0, "identity-hash vectors missing");

        bool sawPrimary;
        bool sawUppercase;
        bytes32 primaryDigest;
        bytes32 uppercaseDigest;

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            string memory uuid = abi.decode(vm.parseJson(json, string.concat(prefix, ".uuid")), (string));
            bytes32 expectedDigest = _parseBytes32(json, string.concat(prefix, ".digest"));
            uint256 preimageLength = _parseBytesLength(json, string.concat(prefix, ".preimageHex"));
            bool isPrimaryRow = _eq(uuid, PRIMARY_UUID);
            bool isUppercaseRow = _eq(uuid, PRIMARY_UUID_UPPER);

            assertEq(preimageLength, 64, string.concat("preimage length mismatch at ", prefix));

            string memory uuidLower = _lowercaseAscii(uuid);
            bytes32 actualDigest = IdentityHash._computeIdentityHash(uuidLower);
            assertEq(actualDigest, expectedDigest, string.concat("identity hash mismatch at ", prefix));

            if (isPrimaryRow) {
                sawPrimary = true;
                primaryDigest = expectedDigest;
            }

            if (isUppercaseRow) {
                sawUppercase = true;
                uppercaseDigest = expectedDigest;
                assertEq(uuidLower, PRIMARY_UUID, "uppercase row must lowercase to primary uuid");
            }
        }

        assertTrue(sawPrimary, "missing primary lowercase row");
        assertTrue(sawUppercase, "missing uppercase canonicalization row");
        assertEq(uppercaseDigest, primaryDigest, "uppercase digest must equal lowercase twin");
    }

    function _parseBytes32(string memory json, string memory path) internal pure returns (bytes32) {
        return abi.decode(vm.parseJson(json, path), (bytes32));
    }

    function _parseBytesLength(string memory json, string memory path) internal pure returns (uint256) {
        bytes memory data = abi.decode(vm.parseJson(json, path), (bytes));
        return data.length;
    }

    function _lowercaseAscii(string memory value) internal pure returns (string memory) {
        bytes memory data = bytes(value);
        for (uint256 i = 0; i < data.length; i++) {
            uint8 c = uint8(data[i]);
            if (c >= 65 && c <= 90) {
                data[i] = bytes1(uint8(c + 32));
            }
        }
        return string(data);
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {WyHash} from "../contracts/libraries/WyHash.sol";
import {WyHashExposed} from "./helpers/WyHashExposed.sol";

/// @title WyHashTest
/// @notice Bun.hash parity tests for the Solidity wyhash port.
/// @dev The vector fixture in test/vectors/wyhash-vectors.json is the A1 gate.
contract WyHashTest is Test {
    string internal constant DEFAULT_SALT = "friend-2026-401";
    string internal constant GAS_UUID = "550e8400-e29b-41d4-a716-446655440000";
    uint32 internal constant GAS_EXPECTED_SEED = 1530910344;

    WyHashExposed internal exposed;

    function setUp() public {
        exposed = new WyHashExposed();
    }

    // -------------------------------------------------------------------------
    // Primary parity gate
    // -------------------------------------------------------------------------

    /// @notice Verify WyHash.hash matches every Bun-derived seed fixture.
    function test_hashMatchesBunVectors() public view {
        string memory json = vm.readFile("test/vectors/wyhash-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".vectorCount"), (uint256));

        require(vectorCount >= 100, "Need 100+ vectors for parity gate");

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            _assertFullInputVector(json, prefix);
        }
    }

    function _assertFullInputVector(string memory json, string memory prefix) internal pure {
        bytes memory input = abi.decode(vm.parseJson(json, string.concat(prefix, ".inputHex")), (bytes));
        uint256 inputLength = abi.decode(vm.parseJson(json, string.concat(prefix, ".inputLength")), (uint256));
        uint32 expectedSeed = uint32(abi.decode(vm.parseJson(json, string.concat(prefix, ".seed32")), (uint256)));

        assertEq(input.length, inputLength, string.concat("inputLength mismatch at ", prefix));

        uint32 actualSeed = WyHash.hash(input, bytes(""));
        assertEq(actualSeed, expectedSeed, string.concat("WyHash parity fail at ", prefix));
    }

    function test_hashTwoArgMatchesBunVectors() public view {
        string memory json = vm.readFile("test/vectors/wyhash-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".vectorCount"), (uint256));

        require(vectorCount >= 100, "Need 100+ vectors for parity gate");

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            uint256 inputLength = abi.decode(vm.parseJson(json, string.concat(prefix, ".inputLength")), (uint256));

            if (inputLength == 51) {
                _assertTwoArgVector(json, prefix);
            }
        }
    }

    function _assertTwoArgVector(string memory json, string memory prefix) internal pure {
        bytes memory input = abi.decode(vm.parseJson(json, string.concat(prefix, ".inputHex")), (bytes));
        uint32 expectedSeed = uint32(abi.decode(vm.parseJson(json, string.concat(prefix, ".seed32")), (uint256)));

        bytes memory uuid = _slice(input, 0, 36);
        bytes memory salt = _slice(input, 36, 15);

        uint32 actualSeed = WyHash.hash(uuid, salt);
        assertEq(actualSeed, expectedSeed, string.concat("WyHash two-arg parity fail at ", prefix));
    }

    // -------------------------------------------------------------------------
    // Primitive tests
    // -------------------------------------------------------------------------

    function test_mum_knownValues() public view {
        _assertMumCase(0, 0, 0, 0);
        _assertMumCase(1, 1, 1, 0);
        _assertMumCase(0x00000000FFFFFFFF, 0x00000000FFFFFFFF, 0xFFFFFFFE00000001, 0);
        _assertMumCase(0xFFFFFFFFFFFFFFFF, 0xFFFFFFFFFFFFFFFF, 0x0000000000000001, 0xFFFFFFFFFFFFFFFE);
        _assertMumCase(0xa0761d6478bd642f, 0xe7037ed1a0b428db, 0x8f3907f7b2b80c35, 0x90ccc56588c08119);
    }

    function _assertMumCase(uint64 a, uint64 b, uint64 expectedLo, uint64 expectedHi) internal view {
        (uint64 actualLo, uint64 actualHi) = exposed.mum(a, b);
        assertEq(actualLo, expectedLo, "mum lo mismatch");
        assertEq(actualHi, expectedHi, "mum hi mismatch");
    }

    function test_read8_littleEndian() public view {
        bytes memory input = hex"0102030405060708";
        uint64 actual = exposed.read8(input, 0);
        assertEq(actual, 0x0807060504030201, "read8 must be little-endian");
    }

    // -------------------------------------------------------------------------
    // Behavior tests
    // -------------------------------------------------------------------------

    function test_hash_gasUnder8K() public {
        bytes memory uuid = bytes(GAS_UUID);
        bytes memory salt = bytes(DEFAULT_SALT);

        uint256 gasBefore = gasleft();
        uint32 result = WyHash.hash(uuid, salt);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("WyHash gas (51 bytes)", gasUsed);

        assertEq(result, GAS_EXPECTED_SEED, "unexpected canonical WyHash output");
        assertLt(gasUsed, 8000, "WyHash exceeds 8K gas ceiling");
    }

    function test_hash_isDeterministic() public pure {
        bytes memory uuid = bytes("00000000-0000-4000-8000-000000000001");
        bytes memory salt = bytes(DEFAULT_SALT);

        uint32 first = WyHash.hash(uuid, salt);
        uint32 second = WyHash.hash(uuid, salt);
        uint32 third = WyHash.hash(uuid, salt);

        assertEq(first, second, "first hash mismatch");
        assertEq(second, third, "second hash mismatch");
    }

    function test_hash_saltChangesOutput() public pure {
        bytes memory uuid = bytes(GAS_UUID);

        uint32 first = WyHash.hash(uuid, bytes(DEFAULT_SALT));
        uint32 second = WyHash.hash(uuid, bytes("friend-2026-402"));

        assertNotEq(first, second, "different salts must produce different hashes");
    }

    function test_hash_uuidChangesOutput() public pure {
        bytes memory salt = bytes(DEFAULT_SALT);

        uint32 first = WyHash.hash(bytes("00000000-0000-4000-8000-000000000001"), salt);
        uint32 second = WyHash.hash(bytes("00000000-0000-4000-8000-000000000002"), salt);

        assertNotEq(first, second, "different UUIDs must produce different hashes");
    }

    function test_hash_emptyInput() public pure {
        uint32 first = WyHash.hash(bytes(""), bytes(""));
        uint32 second = WyHash.hash(bytes(""), bytes(""));

        assertEq(first, second, "empty-input hash must be deterministic");
    }

    // -------------------------------------------------------------------------
    // Test helpers
    // -------------------------------------------------------------------------

    function _slice(bytes memory input, uint256 start, uint256 length) internal pure returns (bytes memory out) {
        out = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            out[i] = input[start + i];
        }
    }
}

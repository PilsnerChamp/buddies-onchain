// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WyHash} from "../../contracts/libraries/WyHash.sol";

contract WyHashExposed {
    function hash(bytes memory data, bytes memory salt) external pure returns (uint32) {
        return WyHash.hash(data, salt);
    }

    function mum(uint64 a, uint64 b) external pure returns (uint64 lo, uint64 hi) {
        return WyHash._mum(a, b);
    }

    function mix(uint64 a, uint64 b) external pure returns (uint64) {
        return WyHash._mix(a, b);
    }

    function read8(bytes memory buf, uint256 offset) external pure returns (uint64) {
        return WyHash._read8(buf, offset);
    }

    function read4(bytes memory buf, uint256 offset) external pure returns (uint64) {
        return WyHash._read4(buf, offset);
    }
}

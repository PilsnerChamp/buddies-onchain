// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WyHash
/// @notice Hash data + salt via wyhash v4.2 and return the lower 32 bits.
/// @dev Matches Bun.hash(string(data) + string(salt)) with seed = 0.
library WyHash {
    uint64 private constant _S0 = 0xa0761d6478bd642f;
    uint64 private constant _S1 = 0xe7037ed1a0b428db;
    uint64 private constant _S2 = 0x8ebc6af09c88c6e3;
    uint64 private constant _S3 = 0x589965cc75374cc3;
    uint64 private constant _MASK32 = 0xFFFFFFFF;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /// @notice Hash the logical concatenation of `data || salt`.
    /// @dev Uses the wyhash v4.2 mixing path with seed hardcoded to zero.
    function hash(bytes memory data, bytes memory salt) internal pure returns (uint32) {
        bytes memory input = abi.encodePacked(data, salt);
        uint256 len = input.length;
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 len64 = uint64(len);

        unchecked {
            uint64 a;
            uint64 b;
            uint64 state0 = _mix(_S0, _S1);

            if (len <= 16) {
                if (len >= 4) {
                    uint256 end = len - 4;
                    uint256 quarter = (len >> 3) << 2;

                    a = (_read4(input, 0) << 32) | _read4(input, quarter);
                    b = (_read4(input, end) << 32) | _read4(input, end - quarter);
                } else if (len > 0) {
                    a = (uint64(uint8(input[0])) << 16) | (uint64(uint8(input[len >> 1])) << 8)
                        | uint64(uint8(input[len - 1]));
                    b = 0;
                } else {
                    a = 0;
                    b = 0;
                }
            } else {
                uint64 state1 = state0;
                uint64 state2 = state0;
                uint256 i = 0;

                if (len >= 48) {
                    while (i + 48 < len) {
                        state0 = _mix(_read8(input, i) ^ _S1, _read8(input, i + 8) ^ state0);
                        state1 = _mix(_read8(input, i + 16) ^ _S2, _read8(input, i + 24) ^ state1);
                        state2 = _mix(_read8(input, i + 32) ^ _S3, _read8(input, i + 40) ^ state2);
                        i += 48;
                    }

                    state0 ^= state1 ^ state2;
                }

                while (i + 16 < len) {
                    state0 = _mix(_read8(input, i) ^ _S1, _read8(input, i + 8) ^ state0);
                    i += 16;
                }

                a = _read8(input, len - 16);
                b = _read8(input, len - 8);
            }

            a ^= _S1;
            b ^= state0;
            (a, b) = _mum(a, b);
            return uint32(_mix(a ^ _S0 ^ len64, b ^ _S1));
        }
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Return the low and high 64-bit halves of a 128-bit product.
    function _mum(uint64 a, uint64 b) internal pure returns (uint64 lo, uint64 hi) {
        unchecked {
            uint64 aLo = a & _MASK32;
            uint64 aHi = a >> 32;
            uint64 bLo = b & _MASK32;
            uint64 bHi = b >> 32;

            uint64 ll = aLo * bLo;
            uint64 hl = aHi * bLo;
            uint64 lh = aLo * bHi;
            uint64 hh = aHi * bHi;

            uint64 cross = (ll >> 32) + (hl & _MASK32) + (lh & _MASK32);

            lo = (cross << 32) | (ll & _MASK32);
            hi = hh + (hl >> 32) + (lh >> 32) + (cross >> 32);
        }
    }

    /// @dev wyhash mix primitive: multiply, then xor the low/high halves.
    function _mix(uint64 a, uint64 b) internal pure returns (uint64) {
        unchecked {
            (uint64 lo, uint64 hi) = _mum(a, b);
            return lo ^ hi;
        }
    }

    /// @dev Read 8 bytes from `buf[offset:offset+8]` in little-endian order.
    function _read8(bytes memory buf, uint256 offset) internal pure returns (uint64 result) {
        assembly {
            result := shr(192, mload(add(add(buf, 32), offset)))
        }

        return _bswap64(result);
    }

    /// @dev Read 4 bytes from `buf[offset:offset+4]` in little-endian order.
    function _read4(bytes memory buf, uint256 offset) internal pure returns (uint64 result) {
        uint32 word;

        assembly {
            word := shr(224, mload(add(add(buf, 32), offset)))
        }

        return uint64(_bswap32(word));
    }

    function _bswap64(uint64 value) private pure returns (uint64) {
        unchecked {
            value = ((value & 0x00FF00FF00FF00FF) << 8) | ((value & 0xFF00FF00FF00FF00) >> 8);
            value = ((value & 0x0000FFFF0000FFFF) << 16) | ((value & 0xFFFF0000FFFF0000) >> 16);
            return (value << 32) | (value >> 32);
        }
    }

    function _bswap32(uint32 value) private pure returns (uint32) {
        unchecked {
            value = ((value & 0x00FF00FF) << 8) | ((value & 0xFF00FF00) >> 8);
            return (value << 16) | (value >> 16);
        }
    }
}

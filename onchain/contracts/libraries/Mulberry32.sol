// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Mulberry32
/// @notice Deterministic 32-bit PRNG library with trait derivation.
/// @dev The step function and derivation call order MUST remain in sync with
///      the TypeScript implementation in plugin/src/bone-deriver.ts.
///      All range scaling uses multiplication-and-shift (never modulo) to
///      guarantee bit-for-bit parity with Math.floor(rng() * n) in JS.
library Mulberry32 {
    // -------------------------------------------------------------------------
    // Core PRNG
    // -------------------------------------------------------------------------

    /// @notice Advance the PRNG by one step and return (newState, rawOutput).
    /// @dev rawOutput is the full uint32. Scale to [0, n) via scaleToRange().
    function next(uint32 state) internal pure returns (uint32 newState, uint32 output) {
        unchecked {
            // state = (state + 0x6D2B79F5) | 0  in JS
            state += 1831565813;

            // t = Math.imul(state ^ (state >>> 15), 1 | state)
            uint32 t = (state ^ (state >> 15)) * (1 | state);

            // t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
            // The JS addition operates in float64 (no 32-bit overflow); both
            // operands are int32-range from Math.imul, so the sum fits losslessly.
            // In Solidity we use uint64 intermediates to match that behavior,
            // then truncate back to uint32 after the XOR.
            uint32 m = (t ^ (t >> 7)) * (61 | t);
            t = uint32(uint64(t) + uint64(m)) ^ t;

            // output = (t ^ (t >>> 14)) >>> 0
            output = t ^ (t >> 14);
            newState = state;
        }
    }

    /// @notice Scale a raw uint32 output to [0, n).
    /// @dev Equivalent to Math.floor(rng() * n) in TypeScript where
    ///      rng() = rawOutput / 2^32. NEVER use modulo for scaling.
    function scaleToRange(uint32 rawOutput, uint32 n) internal pure returns (uint32) {
        return uint32((uint64(rawOutput) * uint64(n)) >> 32);
    }

    // -------------------------------------------------------------------------
    // Trait Derivation
    // -------------------------------------------------------------------------

    /// @notice Derive all buddy traits from a PRNG seed.
    /// @dev Call order is load-bearing and must match the TypeScript exactly.
    function deriveTraits(uint32 seed)
        internal
        pure
        returns (
            uint8 species,
            uint8 rarity,
            uint8 eyes,
            uint8 hat,
            bool shiny,
            uint8 debugging,
            uint8 patience,
            uint8 chaos,
            uint8 wisdom,
            uint8 snark
        )
    {
        uint32 state = seed;
        uint32 roll;

        // --- Call 1: Rarity (weighted) ---
        (state, roll) = next(state);
        rarity = _rollRarity(roll);

        // --- Call 2: Species (uniform 0-17) ---
        (state, roll) = next(state);
        species = uint8(scaleToRange(roll, 18));

        // --- Call 3: Eyes (uniform 0-5) ---
        (state, roll) = next(state);
        eyes = uint8(scaleToRange(roll, 6));

        // --- Call 4: Hat (conditional on rarity) ---
        if (rarity != 0) {
            // Non-Common: roll for hat
            (state, roll) = next(state);
            hat = uint8(scaleToRange(roll, 8));
        } else {
            // Common always "none", NO PRNG call consumed
            hat = 0;
        }

        // --- Call 5: Shiny (1% threshold) ---
        (state, roll) = next(state);
        // 1% of uint32 range: 0.01 * 2^32 = 42949672.96
        shiny = roll < 42949673;

        // --- Calls 6+: Stats ---
        (state, debugging, patience, chaos, wisdom, snark) = _deriveStats(state, rarity);
    }

    // -------------------------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------------------------

    /// @dev Weighted rarity roll. Input is scaleToRange(raw, 100) -> [0, 99].
    ///      Bucket boundaries: Common [0,60), Uncommon [60,85), Rare [85,95),
    ///      Epic [95,99), Legendary [99,100).
    function _rollRarity(uint32 rawOutput) private pure returns (uint8) {
        uint32 roll = scaleToRange(rawOutput, 100);
        if (roll < 60) return 0; // Common
        if (roll < 85) return 1; // Uncommon
        if (roll < 95) return 2; // Rare
        if (roll < 99) return 3; // Epic
        return 4; // Legendary
    }

    /// @dev Base stat value per rarity tier.
    function _statBase(uint8 rarity) private pure returns (uint8) {
        if (rarity == 0) return 5; // Common
        if (rarity == 1) return 15; // Uncommon
        if (rarity == 2) return 25; // Rare
        if (rarity == 3) return 35; // Epic
        return 50; // Legendary
    }

    /// @dev Derive all 5 stats with rejection sampling for secondary.
    ///      Fixed order: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK.
    function _deriveStats(uint32 state, uint8 rarity)
        private
        pure
        returns (uint32 newState, uint8 debugging, uint8 patience, uint8 chaos, uint8 wisdom, uint8 snark)
    {
        uint8 base = _statBase(rarity);
        uint32 roll;

        // Primary stat index (0-4)
        (state, roll) = next(state);
        uint8 primaryIdx = uint8(scaleToRange(roll, 5));

        // Secondary stat index (rejection sampling -- must differ from primary)
        uint8 secondaryIdx;
        do {
            (state, roll) = next(state);
            secondaryIdx = uint8(scaleToRange(roll, 5));
        } while (secondaryIdx == primaryIdx);

        // Compute all 5 stats in fixed order
        uint8[5] memory stats;
        for (uint8 i = 0; i < 5; i++) {
            (state, roll) = next(state);
            if (i == primaryIdx) {
                // base + 50 + floor(rng * 30), capped at 100
                uint16 val = uint16(base) + 50 + uint16(scaleToRange(roll, 30));
                // casting to uint8 is safe because this branch clamps val to <= 100.
                // forge-lint: disable-next-line(unsafe-typecast)
                stats[i] = val > 100 ? 100 : uint8(val);
            } else if (i == secondaryIdx) {
                // max(1, base - 10 + floor(rng * 15))
                int16 val = int16(uint16(base)) - 10 + int16(uint16(scaleToRange(roll, 15)));
                // casting to uint16/uint8 is safe because this branch clamps val to >= 1,
                // and its maximum is 54 (legendary base 50 - 10 + roll 14).
                // forge-lint: disable-next-line(unsafe-typecast)
                stats[i] = val < 1 ? 1 : uint8(uint16(val));
            } else {
                // base + floor(rng * 40)
                stats[i] = uint8(uint16(base) + uint16(scaleToRange(roll, 40)));
            }
        }

        return (state, stats[0], stats[1], stats[2], stats[3], stats[4]);
    }
}

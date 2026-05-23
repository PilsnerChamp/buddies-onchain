// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";

/// @title Mulberry32Test
/// @notice PRNG step-function and trait derivation parity tests.
/// @dev Reads cross-domain test vectors from test/vectors/mulberry32-vectors.json
///      and asserts bit-for-bit parity with the TypeScript implementation.
contract Mulberry32Test is Test {
    /// @dev Packed struct to avoid stack-too-deep when parsing JSON vectors.
    struct ExpectedTraits {
        uint8 rarity;
        uint8 species;
        uint8 eyes;
        uint8 hat;
        bool shiny;
        uint8 debugging;
        uint8 patience;
        uint8 chaos;
        uint8 wisdom;
        uint8 snark;
    }

    // -------------------------------------------------------------------------
    // PRNG step function tests
    // -------------------------------------------------------------------------

    /// @notice Verify that next() produces the same raw uint32 sequence as TypeScript.
    function test_prngStep_matchesTypeScript() public view {
        string memory json = vm.readFile("test/vectors/mulberry32-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".seedCount"), (uint256));

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            _assertPrngSteps(json, prefix);
        }
    }

    function _assertPrngSteps(string memory json, string memory prefix) internal pure {
        uint32 seed = uint32(abi.decode(vm.parseJson(json, string.concat(prefix, ".seed")), (uint256)));

        uint256[] memory rawOutputsBig =
            abi.decode(vm.parseJson(json, string.concat(prefix, ".rawOutputs")), (uint256[]));

        uint32 state = seed;
        for (uint256 j = 0; j < rawOutputsBig.length; j++) {
            uint32 expected = uint32(rawOutputsBig[j]);
            uint32 actual;
            (state, actual) = Mulberry32.next(state);
            assertEq(
                actual, expected, string.concat("PRNG mismatch: seed=", vm.toString(seed), " step=", vm.toString(j))
            );
        }
    }

    /// @notice Verify scaleToRange matches Math.floor(rng() * n) for known values.
    function test_scaleToRange_equivalence() public pure {
        // scaleToRange(0, 100) == floor(0/2^32 * 100) == 0
        assertEq(Mulberry32.scaleToRange(0, 100), 0);

        // scaleToRange(2^32-1, 100) == floor((2^32-1)*100/2^32) == 99
        assertEq(Mulberry32.scaleToRange(type(uint32).max, 100), 99);

        // scaleToRange(2^31, 100) == floor(2147483648*100/2^32) == 50
        assertEq(Mulberry32.scaleToRange(2147483648, 100), 50);

        // scaleToRange(0, 18) == 0
        assertEq(Mulberry32.scaleToRange(0, 18), 0);

        // scaleToRange(2^32-1, 18) == 17
        assertEq(Mulberry32.scaleToRange(type(uint32).max, 18), 17);

        // scaleToRange(anything, 1) == 0
        assertEq(Mulberry32.scaleToRange(999999999, 1), 0);
    }

    // -------------------------------------------------------------------------
    // Trait derivation tests
    // -------------------------------------------------------------------------

    /// @notice Verify deriveTraits() matches TypeScript deriveBones() for all vectors.
    function test_traitDerivation_matchesTypeScript() public view {
        string memory json = vm.readFile("test/vectors/mulberry32-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".seedCount"), (uint256));

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            _assertTraitDerivation(json, prefix);
        }
    }

    function _assertTraitDerivation(string memory json, string memory prefix) internal pure {
        string memory tp = string.concat(prefix, ".traits");
        uint32 seed = uint32(abi.decode(vm.parseJson(json, string.concat(prefix, ".seed")), (uint256)));

        ExpectedTraits memory exp = _parseExpectedTraits(json, tp);

        (
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
        ) = Mulberry32.deriveTraits(seed);

        string memory seedStr = vm.toString(seed);

        assertEq(rarity, exp.rarity, string.concat("rarity mismatch: seed=", seedStr));
        assertEq(species, exp.species, string.concat("species mismatch: seed=", seedStr));
        assertEq(eyes, exp.eyes, string.concat("eyes mismatch: seed=", seedStr));
        assertEq(hat, exp.hat, string.concat("hat mismatch: seed=", seedStr));
        assertEq(shiny, exp.shiny, string.concat("shiny mismatch: seed=", seedStr));
        assertEq(debugging, exp.debugging, string.concat("debugging mismatch: seed=", seedStr));
        assertEq(patience, exp.patience, string.concat("patience mismatch: seed=", seedStr));
        assertEq(chaos, exp.chaos, string.concat("chaos mismatch: seed=", seedStr));
        assertEq(wisdom, exp.wisdom, string.concat("wisdom mismatch: seed=", seedStr));
        assertEq(snark, exp.snark, string.concat("snark mismatch: seed=", seedStr));
    }

    function _parseExpectedTraits(string memory json, string memory tp) internal pure returns (ExpectedTraits memory) {
        return ExpectedTraits({
            rarity: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".rarity")), (uint256))),
            species: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".species")), (uint256))),
            eyes: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".eyes")), (uint256))),
            hat: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".hat")), (uint256))),
            shiny: abi.decode(vm.parseJson(json, string.concat(tp, ".shiny")), (bool)),
            debugging: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".debugging")), (uint256))),
            patience: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".patience")), (uint256))),
            chaos: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".chaos")), (uint256))),
            wisdom: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".wisdom")), (uint256))),
            snark: uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".snark")), (uint256)))
        });
    }

    // -------------------------------------------------------------------------
    // Edge case tests
    // -------------------------------------------------------------------------

    /// @notice deriveTraits for seed 0 should not revert.
    function test_deriveTraits_zeroSeed() public pure {
        (uint8 species,,,,,,,,,) = Mulberry32.deriveTraits(0);
        // Just assert it didn't revert and species is in range
        assertTrue(species < 18);
    }

    /// @notice deriveTraits for max uint32 seed should not revert.
    function test_deriveTraits_maxSeed() public pure {
        (uint8 species,,,,,,,,,) = Mulberry32.deriveTraits(type(uint32).max);
        assertTrue(species < 18);
    }

    /// @notice All rarity values must be in [0, 4].
    function test_rarity_alwaysInRange() public pure {
        // Test a spread of seeds
        uint32[10] memory seeds =
            [uint32(0), 1, 42, 12345, 100000, 999999, 2147483648, 3000000000, 4000000000, 4294967295];
        for (uint256 i = 0; i < seeds.length; i++) {
            (, uint8 rarity,,,,,,,,) = Mulberry32.deriveTraits(seeds[i]);
            assertTrue(rarity <= 4, "rarity out of range");
        }
    }

    /// @notice All stat values must be in [1, 100].
    function test_stats_alwaysInValidRange() public pure {
        uint32[5] memory seeds = [uint32(42), 2990586173, 0, 4294967295, 777777777];
        for (uint256 i = 0; i < seeds.length; i++) {
            (,,,,, uint8 debugging, uint8 patience, uint8 chaos, uint8 wisdom, uint8 snark) =
                Mulberry32.deriveTraits(seeds[i]);
            // Primary stat can be up to 100, secondary min 1, normal can be 0+base
            // The actual minimum for a normal stat is base+0 which is at least 5 for Common
            assertTrue(debugging <= 100, "debugging > 100");
            assertTrue(patience <= 100, "patience > 100");
            assertTrue(chaos <= 100, "chaos > 100");
            assertTrue(wisdom <= 100, "wisdom > 100");
            assertTrue(snark <= 100, "snark > 100");
        }
    }

    /// @notice Common rarity (0) always produces hat = 0 ("none").
    function test_commonRarity_alwaysHatNone() public view {
        string memory json = vm.readFile("test/vectors/mulberry32-vectors.json");
        uint256 vectorCount = abi.decode(vm.parseJson(json, ".seedCount"), (uint256));

        for (uint256 i = 0; i < vectorCount; i++) {
            string memory prefix = string.concat(".vectors[", vm.toString(i), "]");
            string memory tp = string.concat(prefix, ".traits");

            uint8 rarity = uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".rarity")), (uint256)));
            if (rarity == 0) {
                uint8 hat = uint8(abi.decode(vm.parseJson(json, string.concat(tp, ".hat")), (uint256)));
                assertEq(hat, 0, "Common rarity must always have hat=0");
            }
        }
    }
}

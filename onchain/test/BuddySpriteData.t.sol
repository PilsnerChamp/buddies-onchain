// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";

contract BuddySpriteDataTest is Test {
    /// @dev Mirrors BuddySpriteData's private schema constants. Hardcoded here so the
    ///      test file locks the expected schema independently of the deployed bytecode —
    ///      a generator drift that changed e.g. SPECIES_COUNT in the contract would fail
    ///      the corpus-size and per-species assertions, surfacing the divergence.
    uint8 internal constant SPECIES_COUNT = 18;
    uint8 internal constant FRAME_COUNT = 3;
    uint8 internal constant ROWS_PER_FRAME = 5;
    uint8 internal constant HAT_COUNT = 8;
    uint8 internal constant BODY_ROW_WIDTH = 17;
    uint8 internal constant HAT_ROW_WIDTH = 13;

    BuddySpriteData internal spriteData;

    function setUp() public {
        spriteData = new BuddySpriteData();
    }

    function test_bodyCorpus_contains270Rows() public view {
        uint256 count;

        for (uint8 species; species < SPECIES_COUNT; ++species) {
            for (uint8 frame; frame < FRAME_COUNT; ++frame) {
                for (uint8 row; row < ROWS_PER_FRAME; ++row) {
                    spriteData.getBodyRow(species, frame, row);
                    ++count;
                }
            }
        }

        assertEq(count, 270);
    }

    function test_bodyRows_spotCheckRows() public view {
        assertEq(spriteData.getBodyRow(0, 0, 1), "       __        ");
        assertEq(spriteData.getBodyRow(11, 0, 2), "   }~(0 .. 0)~{  ");
    }

    /// @dev Locks species ordering against accidental reorders in onchain/contract-data/sprites/buddies-source.mjs.
    ///      Each assertion pins a visually distinctive frame-0 row to its species index.
    ///      Expected values reflect the generator's exact frame-0-derived shared shift.
    ///      See `docs/onchain/renderer.md` § Horizontal centering.
    function test_bodyRows_lockSpeciesOrder() public view {
        assertEq(spriteData.getBodyRow(0, 0, 2),  "     <(0 )___    "); // duck
        assertEq(spriteData.getBodyRow(1, 0, 1),  "        (0>      "); // goose
        assertEq(spriteData.getBodyRow(2, 0, 1),  "      .----.     "); // blob (+3)
        assertEq(spriteData.getBodyRow(3, 0, 3),  "     (  \xcf\x89  )    "); // cat (ω mouth)
        assertEq(spriteData.getBodyRow(4, 0, 4),  "     `-vvvv-\xc2\xb4   "); // dragon (+3)
        assertEq(spriteData.getBodyRow(5, 0, 4),  "     /\\/\\/\\/\\    "); // octopus
        assertEq(spriteData.getBodyRow(6, 0, 2),  "     ((0)(0))    "); // owl
        assertEq(spriteData.getBodyRow(7, 0, 3),  "     /(   )\\     "); // penguin
        assertEq(spriteData.getBodyRow(8, 0, 3),  "    /[______]\\   "); // turtle
        assertEq(spriteData.getBodyRow(9, 0, 4),  "     ~~~~~~~     "); // snail
        assertEq(spriteData.getBodyRow(10, 0, 4), "     ~`~``~`~    "); // ghost
        assertEq(spriteData.getBodyRow(11, 0, 2), "   }~(0 .. 0)~{  "); // axolotl (+3)
        assertEq(spriteData.getBodyRow(12, 0, 1), "     n______n    "); // capybara (+3)
        assertEq(spriteData.getBodyRow(13, 0, 1), "    n  ____  n   "); // cactus (+3)
        assertEq(spriteData.getBodyRow(14, 0, 1), "      .[||].     "); // robot
        assertEq(spriteData.getBodyRow(15, 0, 1), "      (\\__/)     "); // rabbit
        assertEq(spriteData.getBodyRow(16, 0, 1), "    .-o-OO-o-.   "); // mushroom
        assertEq(spriteData.getBodyRow(17, 0, 1), "     /\\    /\\    "); // chonk (+3)
    }

    /// @dev Locks hat ordering against accidental reorders in onchain/contract-data/sprites/buddies-source.mjs.
    ///      Expected values reflect the generator's 13-col hat centering pass
    ///      (ceil((13 - bboxWidth) / 2) target). See `docs/onchain/renderer.md`
    ///      § Hat composition.
    function test_hatRows_lockHatOrder() public view {
        assertEq(spriteData.getHatRow(0), "             "); // none
        assertEq(spriteData.getHatRow(1), "    \\^^^/    "); // crown
        assertEq(spriteData.getHatRow(2), "    [___]    "); // tophat
        assertEq(spriteData.getHatRow(3), "     -+-     "); // propeller
        assertEq(spriteData.getHatRow(4), "    (   )    "); // halo
        assertEq(spriteData.getHatRow(5), "     /^\\     "); // wizard
        assertEq(spriteData.getHatRow(6), "    (___)    "); // beanie
        assertEq(spriteData.getHatRow(7), "      ,>     "); // tinyduck
    }

    function test_bodyRows_allAre17Bytes() public view {
        for (uint8 species; species < SPECIES_COUNT; ++species) {
            for (uint8 frame; frame < FRAME_COUNT; ++frame) {
                for (uint8 row; row < ROWS_PER_FRAME; ++row) {
                    assertEq(bytes(spriteData.getBodyRow(species, frame, row)).length, BODY_ROW_WIDTH);
                }
            }
        }
    }

    function test_hatRows_allAre13Bytes() public view {
        for (uint8 hat; hat < HAT_COUNT; ++hat) {
            assertEq(bytes(spriteData.getHatRow(hat)).length, HAT_ROW_WIDTH);
        }
    }

    function test_bodyRows_expectedRowsPreserveEyeSentinel() public view {
        assertTrue(_contains(spriteData.getBodyRow(0, 0, 2), "0"));
        assertTrue(_contains(spriteData.getBodyRow(11, 0, 2), "0"));
    }

    function test_BodyUsesRow0_bitmapValue() public view {
        uint32 reconstructed;
        for (uint8 species; species < SPECIES_COUNT; ++species) {
            if (spriteData.bodyUsesRow0(species)) {
                reconstructed |= uint32(1) << species;
            }
        }
        assertEq(reconstructed, uint32(0x000174B0));
    }

    function test_BodyUsesRow0_bitsSetForRow0UsingSpecies() public view {
        assertTrue(spriteData.bodyUsesRow0(4));
        assertTrue(spriteData.bodyUsesRow0(5));
        assertTrue(spriteData.bodyUsesRow0(7));
        assertTrue(spriteData.bodyUsesRow0(10));
        assertTrue(spriteData.bodyUsesRow0(12));
        assertTrue(spriteData.bodyUsesRow0(13));
        assertTrue(spriteData.bodyUsesRow0(14));
        assertTrue(spriteData.bodyUsesRow0(16));
    }

    function test_BodyUsesRow0_bitsClearForBlankRow0Species() public view {
        assertFalse(spriteData.bodyUsesRow0(0));
        assertFalse(spriteData.bodyUsesRow0(1));
        assertFalse(spriteData.bodyUsesRow0(2));
        assertFalse(spriteData.bodyUsesRow0(3));
        assertFalse(spriteData.bodyUsesRow0(6));
        assertFalse(spriteData.bodyUsesRow0(8));
        assertFalse(spriteData.bodyUsesRow0(9));
        assertFalse(spriteData.bodyUsesRow0(11));
        assertFalse(spriteData.bodyUsesRow0(15));
        assertFalse(spriteData.bodyUsesRow0(17));
    }

    function test_BodyUsesRow0_outOfBoundsReverts() public {
        vm.expectRevert(BuddySpriteData.InvalidBodyIndex.selector);
        spriteData.bodyUsesRow0(SPECIES_COUNT);
    }

    function test_getBodyRow_revertsOutOfRange() public {
        vm.expectRevert(BuddySpriteData.InvalidBodyIndex.selector);
        spriteData.getBodyRow(SPECIES_COUNT, 0, 0);

        vm.expectRevert(BuddySpriteData.InvalidBodyIndex.selector);
        spriteData.getBodyRow(0, FRAME_COUNT, 0);

        vm.expectRevert(BuddySpriteData.InvalidBodyIndex.selector);
        spriteData.getBodyRow(0, 0, ROWS_PER_FRAME);
    }

    function test_getHatRow_revertsOutOfRange() public {
        vm.expectRevert(BuddySpriteData.InvalidHatIndex.selector);
        spriteData.getHatRow(HAT_COUNT);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);

        if (needleBytes.length == 0 || needleBytes.length > haystackBytes.length) {
            return false;
        }

        for (uint256 i = 0; i <= haystackBytes.length - needleBytes.length; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < needleBytes.length; ++j) {
                if (haystackBytes[i + j] != needleBytes[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                return true;
            }
        }

        return false;
    }
}

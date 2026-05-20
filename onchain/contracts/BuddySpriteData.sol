// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BuddyDomain} from "./libraries/BuddyDomain.sol";

/// @title BuddySpriteData
/// @notice Fixed-width packed sprite corpus for the Buddies Onchain renderer.
/// @dev Body rows are stored species-major, then frame-major, then row-major.
///      Hat rows follow canonical hat enum order and all rows are right-padded with spaces.
///      Generated from onchain/contract-data/sprites/buddies-source.mjs by onchain/contract-data/sprites/tools/gen-sprite-data.mjs. Do not edit by hand.
contract BuddySpriteData {
    uint32 private constant BODY_USES_ROW_0 = 0x000174B0;

    error InvalidBodyIndex();
    error InvalidHatIndex();

    bytes private constant BODY_DATA =
        // duck
        // frame 0
        unicode"                 "
        unicode"       __        "
        unicode"     <(0 )___    "
        unicode"      (  ._>     "
        unicode"       `--´     "
        // frame 1
        unicode"                 "
        unicode"       __        "
        unicode"     <(0 )___    "
        unicode"      (  ._>     "
        unicode"       `--´~    "
        // frame 2
        unicode"                 "
        unicode"       __        "
        unicode"     <(0 )___    "
        unicode"      (  .__>    "
        unicode"       `--´     "
        // goose
        // frame 0
        unicode"                 "
        unicode"        (0>      "
        unicode"        ||       "
        unicode"      _(__)_     "
        unicode"       ^^^^      "
        // frame 1
        unicode"                 "
        unicode"       (0>       "
        unicode"        ||       "
        unicode"      _(__)_     "
        unicode"       ^^^^      "
        // frame 2
        unicode"                 "
        unicode"        (0>>     "
        unicode"        ||       "
        unicode"      _(__)_     "
        unicode"       ^^^^      "
        // blob
        // frame 0
        unicode"                 "
        unicode"      .----.     "
        unicode"     ( 0  0 )    "
        unicode"     (      )    "
        unicode"      `----´    "
        // frame 1
        unicode"                 "
        unicode"     .------.    "
        unicode"    (  0  0  )   "
        unicode"    (        )   "
        unicode"     `------´   "
        // frame 2
        unicode"                 "
        unicode"       .--.      "
        unicode"      (0  0)     "
        unicode"      (    )     "
        unicode"       `--´     "
        // cat
        // frame 0
        unicode"                 "
        unicode"      /\\_/\\      "
        unicode"     ( 0   0)    "
        unicode"     (  ω  )    "
        unicode"     (\")_(\")     "
        // frame 1
        unicode"                 "
        unicode"      /\\_/\\      "
        unicode"     ( 0   0)    "
        unicode"     (  ω  )    "
        unicode"     (\")_(\")~    "
        // frame 2
        unicode"                 "
        unicode"      /\\-/\\      "
        unicode"     ( 0   0)    "
        unicode"     (  ω  )    "
        unicode"     (\")_(\")     "
        // dragon
        // frame 0
        unicode"                 "
        unicode"     /^\\  /^\\    "
        unicode"    <  0  0  >   "
        unicode"    (   ~~   )   "
        unicode"     `-vvvv-´   "
        // frame 1
        unicode"                 "
        unicode"     /^\\  /^\\    "
        unicode"    <  0  0  >   "
        unicode"    (        )   "
        unicode"     `-vvvv-´   "
        // frame 2
        unicode"      ~    ~     "
        unicode"     /^\\  /^\\    "
        unicode"    <  0  0  >   "
        unicode"    (   ~~   )   "
        unicode"     `-vvvv-´   "
        // octopus
        // frame 0
        unicode"                 "
        unicode"      .----.     "
        unicode"     ( 0  0 )    "
        unicode"     (______)    "
        unicode"     /\\/\\/\\/\\    "
        // frame 1
        unicode"                 "
        unicode"      .----.     "
        unicode"     ( 0  0 )    "
        unicode"     (______)    "
        unicode"     \\/\\/\\/\\/    "
        // frame 2
        unicode"        o        "
        unicode"      .----.     "
        unicode"     ( 0  0 )    "
        unicode"     (______)    "
        unicode"     /\\/\\/\\/\\    "
        // owl
        // frame 0
        unicode"                 "
        unicode"      /\\  /\\     "
        unicode"     ((0)(0))    "
        unicode"     (  ><  )    "
        unicode"      `----´    "
        // frame 1
        unicode"                 "
        unicode"      /\\  /\\     "
        unicode"     ((0)(0))    "
        unicode"     (  ><  )    "
        unicode"      .----.     "
        // frame 2
        unicode"                 "
        unicode"      /\\  /\\     "
        unicode"     ((0)(-))    "
        unicode"     (  ><  )    "
        unicode"      `----´    "
        // penguin
        // frame 0
        unicode"                 "
        unicode"      .---.      "
        unicode"      (0>0)      "
        unicode"     /(   )\\     "
        unicode"      `---´     "
        // frame 1
        unicode"                 "
        unicode"      .---.      "
        unicode"      (0>0)      "
        unicode"     |(   )|     "
        unicode"      `---´     "
        // frame 2
        unicode"      .---.      "
        unicode"      (0>0)      "
        unicode"     /(   )\\     "
        unicode"      `---´     "
        unicode"       ~ ~       "
        // turtle
        // frame 0
        unicode"                 "
        unicode"      _,--._     "
        unicode"     ( 0  0 )    "
        unicode"    /[______]\\   "
        unicode"     ``    ``    "
        // frame 1
        unicode"                 "
        unicode"      _,--._     "
        unicode"     ( 0  0 )    "
        unicode"    /[______]\\   "
        unicode"      ``  ``     "
        // frame 2
        unicode"                 "
        unicode"      _,--._     "
        unicode"     ( 0  0 )    "
        unicode"    /[======]\\   "
        unicode"     ``    ``    "
        // snail
        // frame 0
        unicode"                 "
        unicode"    0    .--.    "
        unicode"     \\  ( @ )    "
        unicode"      \\_`--´    "
        unicode"     ~~~~~~~     "
        // frame 1
        unicode"                 "
        unicode"     0   .--.    "
        unicode"     |  ( @ )    "
        unicode"      \\_`--´    "
        unicode"     ~~~~~~~     "
        // frame 2
        unicode"                 "
        unicode"    0    .--.    "
        unicode"     \\  ( @  )   "
        unicode"      \\_`--´    "
        unicode"      ~~~~~~     "
        // ghost
        // frame 0
        unicode"                 "
        unicode"      .----.     "
        unicode"     / 0  0 \\    "
        unicode"     |      |    "
        unicode"     ~`~``~`~    "
        // frame 1
        unicode"                 "
        unicode"      .----.     "
        unicode"     / 0  0 \\    "
        unicode"     |      |    "
        unicode"     `~`~~`~`    "
        // frame 2
        unicode"       ~  ~      "
        unicode"      .----.     "
        unicode"     / 0  0 \\    "
        unicode"     |      |    "
        unicode"     ~~`~~`~~    "
        // axolotl
        // frame 0
        unicode"                 "
        unicode"   }~(______)~{  "
        unicode"   }~(0 .. 0)~{  "
        unicode"     ( .--. )    "
        unicode"     (_/  \\_)    "
        // frame 1
        unicode"                 "
        unicode"   ~}(______){~  "
        unicode"   ~}(0 .. 0){~  "
        unicode"     ( .--. )    "
        unicode"     (_/  \\_)    "
        // frame 2
        unicode"                 "
        unicode"   }~(______)~{  "
        unicode"   }~(0 .. 0)~{  "
        unicode"     (  --  )    "
        unicode"     ~_/  \\_~    "
        // capybara
        // frame 0
        unicode"                 "
        unicode"     n______n    "
        unicode"    ( 0    0 )   "
        unicode"    (   oo   )   "
        unicode"     `------´   "
        // frame 1
        unicode"                 "
        unicode"     n______n    "
        unicode"    ( 0    0 )   "
        unicode"    (   Oo   )   "
        unicode"     `------´   "
        // frame 2
        unicode"       ~  ~      "
        unicode"     u______n    "
        unicode"    ( 0    0 )   "
        unicode"    (   oo   )   "
        unicode"     `------´   "
        // cactus
        // frame 0
        unicode"                 "
        unicode"    n  ____  n   "
        unicode"    | |0  0| |   "
        unicode"    |_|    |_|   "
        unicode"      |    |     "
        // frame 1
        unicode"                 "
        unicode"       ____      "
        unicode"    n |0  0| n   "
        unicode"    |_|    |_|   "
        unicode"      |    |     "
        // frame 2
        unicode"    n        n   "
        unicode"    |  ____  |   "
        unicode"    | |0  0| |   "
        unicode"    |_|    |_|   "
        unicode"      |    |     "
        // robot
        // frame 0
        unicode"                 "
        unicode"      .[||].     "
        unicode"     [ 0  0 ]    "
        unicode"     [ ==== ]    "
        unicode"     `------´   "
        // frame 1
        unicode"                 "
        unicode"      .[||].     "
        unicode"     [ 0  0 ]    "
        unicode"     [ -==- ]    "
        unicode"     `------´   "
        // frame 2
        unicode"        *        "
        unicode"      .[||].     "
        unicode"     [ 0  0 ]    "
        unicode"     [ ==== ]    "
        unicode"     `------´   "
        // rabbit
        // frame 0
        unicode"                 "
        unicode"      (\\__/)     "
        unicode"     ( 0  0 )    "
        unicode"    =(  ..  )=   "
        unicode"     (\")__(\")    "
        // frame 1
        unicode"                 "
        unicode"      (|__/)     "
        unicode"     ( 0  0 )    "
        unicode"    =(  ..  )=   "
        unicode"     (\")__(\")    "
        // frame 2
        unicode"                 "
        unicode"      (\\__/)     "
        unicode"     ( 0  0 )    "
        unicode"    =( .  . )=   "
        unicode"     (\")__(\")    "
        // mushroom
        // frame 0
        unicode"                 "
        unicode"    .-o-OO-o-.   "
        unicode"   (__________)  "
        unicode"      |0  0|     "
        unicode"      |____|     "
        // frame 1
        unicode"                 "
        unicode"    .-O-oo-O-.   "
        unicode"   (__________)  "
        unicode"      |0  0|     "
        unicode"      |____|     "
        // frame 2
        unicode"      . o  .     "
        unicode"    .-o-OO-o-.   "
        unicode"   (__________)  "
        unicode"      |0  0|     "
        unicode"      |____|     "
        // chonk
        // frame 0
        unicode"                 "
        unicode"     /\\    /\\    "
        unicode"    ( 0    0 )   "
        unicode"    (   ..   )   "
        unicode"     `------´   "
        // frame 1
        unicode"                 "
        unicode"     /\\    /|    "
        unicode"    ( 0    0 )   "
        unicode"    (   ..   )   "
        unicode"     `------´   "
        // frame 2
        unicode"                 "
        unicode"     /\\    /\\    "
        unicode"    ( 0    0 )   "
        unicode"    (   ..   )   "
        unicode"     `------´~  ";

    bytes private constant HAT_DATA =
        // none
        unicode"             "
        // crown
        unicode"    \\^^^/    "
        // tophat
        unicode"    [___]    "
        // propeller
        unicode"     -+-     "
        // halo
        unicode"    (   )    "
        // wizard
        unicode"     /^\\     "
        // beanie
        unicode"    (___)    "
        // tinyduck
        unicode"      ,>     ";

    function getBodyRow(uint8 species, uint8 frame, uint8 row) external pure returns (string memory) {
        if (
            species >= BuddyDomain.SPECIES_COUNT || frame >= BuddyDomain.FRAME_COUNT
                || row >= BuddyDomain.SPRITE_ROW_COUNT
        ) {
            revert InvalidBodyIndex();
        }

        uint256 rowIndex = uint256(species) * uint256(BuddyDomain.FRAME_COUNT) * uint256(BuddyDomain.SPRITE_ROW_COUNT)
            + uint256(frame) * uint256(BuddyDomain.SPRITE_ROW_COUNT) + uint256(row);

        return _slice(BODY_DATA, rowIndex * uint256(BuddyDomain.BODY_ROW_WIDTH), BuddyDomain.BODY_ROW_WIDTH);
    }

    function bodyUsesRow0(uint8 species) external pure returns (bool) {
        if (species >= BuddyDomain.SPECIES_COUNT) {
            revert InvalidBodyIndex();
        }

        return ((BODY_USES_ROW_0 >> species) & 1) == 1;
    }

    function getHatRow(uint8 hat) external pure returns (string memory) {
        if (hat >= BuddyDomain.HAT_COUNT) {
            revert InvalidHatIndex();
        }

        return _slice(HAT_DATA, uint256(hat) * uint256(BuddyDomain.HAT_ROW_WIDTH), BuddyDomain.HAT_ROW_WIDTH);
    }

    function _slice(bytes memory data, uint256 offset, uint256 width) private pure returns (string memory) {
        bytes memory row = new bytes(width);

        for (uint256 i = 0; i < width; ++i) {
            row[i] = data[offset + i];
        }

        return string(row);
    }
}

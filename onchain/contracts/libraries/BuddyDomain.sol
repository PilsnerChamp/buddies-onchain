// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library BuddyDomain {
    string internal constant SITE_ORIGIN = "https://buddies-onchain.xyz";

    uint8 internal constant SPECIES_COUNT = 18;
    uint8 internal constant RARITY_COUNT = 5;
    uint8 internal constant EYE_COUNT = 6;
    uint8 internal constant HAT_COUNT = 8;
    uint8 internal constant FRAME_COUNT = 3;
    uint8 internal constant SPRITE_ROW_COUNT = 5;
    uint8 internal constant BODY_ROW_WIDTH = 17;
    uint8 internal constant HAT_ROW_WIDTH = 13;

    uint32 internal constant UINT32_MASK = type(uint32).max;

    bytes internal constant LOWERCASE_HEX_DIGITS = "0123456789abcdef";

    bytes1 internal constant ASCII_SPACE = 0x20;
    bytes1 internal constant ASCII_QUOTE = 0x22;
    bytes1 internal constant ASCII_APOSTROPHE = 0x27;
    bytes1 internal constant ASCII_AMP = 0x26;
    bytes1 internal constant ASCII_HYPHEN = 0x2d;
    bytes1 internal constant ASCII_DIGIT_0 = 0x30;
    bytes1 internal constant ASCII_DIGIT_4 = 0x34;
    bytes1 internal constant ASCII_DIGIT_8 = 0x38;
    bytes1 internal constant ASCII_DIGIT_9 = 0x39;
    bytes1 internal constant ASCII_LT = 0x3c;
    bytes1 internal constant ASCII_GT = 0x3e;
    bytes1 internal constant ASCII_BACKSLASH = 0x5c;
    bytes1 internal constant ASCII_LOWER_A = 0x61;
    bytes1 internal constant ASCII_LOWER_B = 0x62;
    bytes1 internal constant ASCII_LOWER_F = 0x66;
    bytes1 internal constant ASCII_LOWER_G = 0x67;
    bytes1 internal constant ASCII_LOWER_L = 0x6c;
    bytes1 internal constant ASCII_LOWER_M = 0x6d;
    bytes1 internal constant ASCII_LOWER_N = 0x6e;
    bytes1 internal constant ASCII_LOWER_O = 0x6f;
    bytes1 internal constant ASCII_LOWER_P = 0x70;
    bytes1 internal constant ASCII_LOWER_Q = 0x71;
    bytes1 internal constant ASCII_LOWER_R = 0x72;
    bytes1 internal constant ASCII_LOWER_S = 0x73;
    bytes1 internal constant ASCII_LOWER_T = 0x74;
    bytes1 internal constant ASCII_LOWER_U = 0x75;
    bytes1 internal constant ASCII_LOWER_Z = 0x7a;
    bytes1 internal constant ASCII_SEMICOLON = 0x3b;
    bytes1 internal constant ASCII_UPPERCASE_MASK = 0xdf;
}

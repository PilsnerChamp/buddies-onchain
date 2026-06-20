// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";

/// @dev Operator playbook on failure: each test enforces a hard EIP-170 cap AND a soft empirical
///      ceiling. If a test fails: (1) if the change is intentional, bump the constant + update the
///      comment with the new baseline + commit; (2) otherwise investigate the change that
///      introduced the drift. BuddyRenderer's headroom is intentionally tighter than the others
///      because it sits closest to EIP-170 — a small addition gets a loud signal.
contract BytecodeSizeTest is Test {
    uint256 private constant EIP170_RUNTIME_CODE_LIMIT = 24_576;

    // Baseline: 12_879 bytes (was 13_582 under the two-selector bond + reclaimAndHatch model;
    // collapsing into the single claim() door — one struct, one typehash, one selector — net
    // SHRANK the contract despite the 4-way branch + retained name). Ceiling HELD at 14_000;
    // ~8% headroom, so the next BuddyNFT addition trips this gate loudly and forces a deliberate
    // ceiling decision.
    uint256 private constant BUDDY_NFT_SIZE_CEILING = 14_000;
    // Baseline: 21_121 bytes; ~7% headroom — tight on purpose because EIP-170 is only 3,455
    // bytes above the baseline. Renderer additions of ~1.4 KB trip this ceiling well before
    // hitting the hard cap, forcing review of any renderer change that flirts with un-deployability.
    uint256 private constant BUDDY_RENDERER_SIZE_CEILING = 22_500;
    // Baseline: 5_731 bytes; ~10% headroom rounded up to catch sprite corpus bytecode drift.
    uint256 private constant BUDDY_SPRITE_DATA_SIZE_CEILING = 6_400;
    // Baseline: 1_600 bytes; 10% headroom for font wrapper bytecode drift.
    uint256 private constant BUDDY_FONT_SIZE_CEILING = 1_760;
    // Baseline: 1_614 bytes; ~10% headroom rounded up to catch sprite-font wrapper bytecode drift.
    uint256 private constant BUDDY_SPRITE_FONT_SIZE_CEILING = 1_780;

    string private constant FONT_PATH = "contract-data/fonts/chrome/BuddyFont.woff2";
    string private constant SPRITE_FONT_PATH = "contract-data/fonts/sprite/BuddySpriteFont.woff2";

    BuddySpriteData internal spriteData;
    BuddyFont internal buddyFont;
    BuddySpriteFont internal buddySpriteFont;
    BuddyRenderer internal renderer;
    BuddyNFT internal nft;

    function setUp() public {
        if (vm.isContext(VmSafe.ForgeContext.Coverage)) {
            vm.skip(true, "bytecode ceilings are optimizer-dependent; forge coverage disables optimizer");
        }

        spriteData = new BuddySpriteData();
        buddyFont = new BuddyFont(vm.readFileBinary(FONT_PATH));
        buddySpriteFont = new BuddySpriteFont(vm.readFileBinary(SPRITE_FONT_PATH));
        renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        nft = new BuddyNFT(address(this), address(renderer));
    }

    function test_bytecodeSize_BuddyNFT_underLimit() public view {
        uint256 size = address(nft).code.length;
        assertLt(size, EIP170_RUNTIME_CODE_LIMIT, "BuddyNFT exceeds EIP-170 runtime code limit");
        assertLe(size, BUDDY_NFT_SIZE_CEILING, "BuddyNFT exceeds empirical bytecode ceiling");
    }

    function test_bytecodeSize_BuddyRenderer_underLimit() public view {
        uint256 size = address(renderer).code.length;
        assertLt(size, EIP170_RUNTIME_CODE_LIMIT, "BuddyRenderer exceeds EIP-170 runtime code limit");
        assertLe(size, BUDDY_RENDERER_SIZE_CEILING, "BuddyRenderer exceeds empirical bytecode ceiling");
    }

    function test_bytecodeSize_BuddySpriteData_underLimit() public view {
        uint256 size = address(spriteData).code.length;
        assertLt(size, EIP170_RUNTIME_CODE_LIMIT, "BuddySpriteData exceeds EIP-170 runtime code limit");
        assertLe(size, BUDDY_SPRITE_DATA_SIZE_CEILING, "BuddySpriteData exceeds empirical bytecode ceiling");
    }

    function test_bytecodeSize_BuddyFont_underLimit() public view {
        uint256 size = address(buddyFont).code.length;
        assertLt(size, EIP170_RUNTIME_CODE_LIMIT, "BuddyFont exceeds EIP-170 runtime code limit");
        assertLe(size, BUDDY_FONT_SIZE_CEILING, "BuddyFont exceeds empirical bytecode ceiling");
    }

    function test_bytecodeSize_BuddySpriteFont_underLimit() public view {
        uint256 size = address(buddySpriteFont).code.length;
        assertLt(size, EIP170_RUNTIME_CODE_LIMIT, "BuddySpriteFont exceeds EIP-170 runtime code limit");
        assertLe(size, BUDDY_SPRITE_FONT_SIZE_CEILING, "BuddySpriteFont exceeds empirical bytecode ceiling");
    }
}

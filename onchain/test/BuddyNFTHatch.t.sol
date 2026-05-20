// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {WyHash} from "../contracts/libraries/WyHash.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {IBuddyRenderer} from "../contracts/interfaces/IBuddyRenderer.sol";

/// @dev Minimal mock renderer for tokenURI passthrough tests.
contract MockRenderer is IBuddyRenderer {
    function tokenURI(address, uint256) external pure returns (string memory) {
        return "mock";
    }
}

contract BuddyNFTHatchTest is Test {
    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher);

    BuddyNFT internal nft;
    address internal owner;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant HATCH_SALT = "friend-2026-401";

    function setUp() public {
        owner = makeAddr("owner");
        nft = new BuddyNFT(owner, address(0));
    }

    // -------------------------------------------------------------------------
    // Happy path / stored state
    // -------------------------------------------------------------------------

    function test_hatch_success() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(tokenId, 1);
    }

    function test_hatch_emitsEvent() public {
        bytes32 identityHash = keccak256(bytes(TEST_UUID));

        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(1, identityHash, address(this));

        nft.hatch(TEST_UUID);
    }

    function test_hatch_mintsToContractCustody() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(nft.ownerOf(tokenId), address(nft));
    }

    function test_hatch_setsCustodialStage() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Custodial));
    }

    function test_hatch_storesIdentityHash() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(nft.buddyIdentityHash(tokenId), keccak256(bytes(TEST_UUID)));
    }

    function test_hatch_storesPrngSeedFromCanonicalPipeline() public {
        uint32 expectedSeed = WyHash.hash(bytes(TEST_UUID), bytes(HATCH_SALT));
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(nft.buddyPrngSeed(tokenId), expectedSeed);
    }

    function test_hatch_storesTraitsMatchingCanonicalPipeline() public {
        uint32 seed = WyHash.hash(bytes(TEST_UUID), bytes(HATCH_SALT));
        (
            uint8 species, uint8 rarity, uint8 eyes, uint8 hat, bool shiny,
            uint8 debugging, uint8 patience, uint8 chaos, uint8 wisdom, uint8 snark
        ) = Mulberry32.deriveTraits(seed);

        uint256 tokenId = nft.hatch(TEST_UUID);
        IBuddyNFT.BuddyTraits memory traits = nft.buddyTraits(tokenId);

        assertEq(traits.species, species);
        assertEq(traits.rarity, rarity);
        assertEq(traits.eyes, eyes);
        assertEq(traits.hat, hat);
        assertEq(traits.shiny, shiny);
        assertEq(traits.debugging, debugging);
        assertEq(traits.patience, patience);
        assertEq(traits.chaos, chaos);
        assertEq(traits.wisdom, wisdom);
        assertEq(traits.snark, snark);
    }

    function test_hatch_recordsHatcher() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(nft.hatcher(tokenId), address(this));

        // Third party hatches a different UUID
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        uint256 tokenId2 = nft.hatch("f47ac10b-58cc-4372-a567-0e02b2c3d479");
        assertEq(nft.hatcher(tokenId2), stranger);
    }

    function test_hatch_incrementsTokenId() public {
        uint256 id1 = nft.hatch("00000000-0000-4000-8000-000000000001");
        uint256 id2 = nft.hatch("00000000-0000-4000-8000-000000000002");
        uint256 id3 = nft.hatch("00000000-0000-4000-8000-000000000003");

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }

    function test_hatch_nameIsEmpty() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(nft.buddyName(tokenId), "");
    }

    // -------------------------------------------------------------------------
    // Uniqueness / replay
    // -------------------------------------------------------------------------

    function test_hatch_revertsAlreadyHatched() public {
        nft.hatch(TEST_UUID);

        vm.expectRevert(BuddyNFT.AlreadyHatched.selector);
        nft.hatch(TEST_UUID);
    }

    // -------------------------------------------------------------------------
    // UUID validation
    // -------------------------------------------------------------------------

    function test_hatch_revertsInvalidUuidFormat_wrongLength() public {
        // 35 chars (too short)
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-a456-42661417400");

        // 37 chars (too long)
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-a456-4266141740001");
    }

    function test_hatch_revertsInvalidUuidFormat_uppercaseHex() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123E4567-e89b-42d3-a456-426614174000");

        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-A456-426614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_invalidCharacter() public {
        // 'g' in first segment
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("g23e4567-e89b-42d3-a456-426614174000");

        // 'z' in last segment
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-a456-z26614174000");

        // space
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-a456- 26614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_wrongDashPositions() public {
        // Dash at position 7 instead of 8
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e456-7e89b-42d3-a456-426614174000");

        // No dash at position 13, dash elsewhere
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b4-2d3-a456-426614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_missingDashes() public {
        // All hex, no dashes, padded to 36 chars
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567e89b42d3a456426614174000abcd");
    }

    function test_hatch_revertsInvalidUuidFormat_emptyString() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("");
    }

    // -------------------------------------------------------------------------
    // UUID v4 lock — version-nibble + variant-nibble matrix
    // -------------------------------------------------------------------------

    function test_hatch_revertsInvalidUuidFormat_v1() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("c232ab00-9414-11ec-b909-0242ac120002");
    }

    function test_hatch_revertsInvalidUuidFormat_v2() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("000003e8-7a83-21ed-9d00-3fdb0085247e");
    }

    function test_hatch_revertsInvalidUuidFormat_v3() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("5df41881-3aed-3515-88a7-2f4a814cf09e");
    }

    function test_hatch_revertsInvalidUuidFormat_v5() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("2ed6657d-e927-568b-95e1-2665a8aea6a2");
    }

    function test_hatch_revertsInvalidUuidFormat_v6() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("1ec9414c-232a-6b00-b3c8-9e6bdeced846");
    }

    function test_hatch_revertsInvalidUuidFormat_v7() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("017f22e2-79b0-7cc3-98c4-dc0c0c07398f");
    }

    function test_hatch_revertsInvalidUuidFormat_v8() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("320c3d4d-cc00-875b-8ec9-32363b3da32d");
    }

    function test_hatch_revertsInvalidUuidFormat_versionZero() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-02d3-a456-426614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_versionNine() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-92d3-a456-426614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_variantSeven() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-7456-426614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_variantC() public {
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-c456-426614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_variantColon() public {
        // Catches naive-range bug: ':' = 0x3A, between '9' (0x39) and 'a' (0x61).
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-:456-426614174000");
    }

    function test_hatch_revertsInvalidUuidFormat_variantSemicolon() public {
        // Catches naive-range bug: ';' = 0x3B, also between '9' and 'a'.
        vm.expectRevert(BuddyNFT.InvalidUuidFormat.selector);
        nft.hatch("123e4567-e89b-42d3-;456-426614174000");
    }

    function test_hatch_acceptsV4_variant8() public {
        // setUp() gives a fresh nft per test — tokenId is always 1 here.
        uint256 tokenId = nft.hatch("123e4567-e89b-42d3-8456-426614174000");
        assertEq(tokenId, 1);
    }

    function test_hatch_acceptsV4_variant9() public {
        uint256 tokenId = nft.hatch("123e4567-e89b-42d3-9456-426614174000");
        assertEq(tokenId, 1);
    }

    function test_hatch_acceptsV4_variantA() public {
        uint256 tokenId = nft.hatch("123e4567-e89b-42d3-a456-426614174000");
        assertEq(tokenId, 1);
    }

    function test_hatch_acceptsV4_variantB() public {
        uint256 tokenId = nft.hatch("123e4567-e89b-42d3-b456-426614174000");
        assertEq(tokenId, 1);
    }

    // -------------------------------------------------------------------------
    // Soulbound / invariants
    // -------------------------------------------------------------------------

    function test_hatch_transferFromContractReverts() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        address someWallet = makeAddr("someWallet");

        // External caller has no approval — the soulbound enforcement for
        // custodial tokens is that approve() and setApprovalForAll() revert
        // Soulbound(), so nobody can gain transfer authorization. The _update
        // gate allows from==address(this) && stage==Custodial (the bond path),
        // but OZ's auth check blocks unauthorized callers first.
        vm.prank(someWallet);
        vm.expectRevert(abi.encodeWithSelector(
            IERC721Errors.ERC721InsufficientApproval.selector, someWallet, tokenId
        ));
        nft.transferFrom(address(nft), someWallet, tokenId);
    }

    function test_hatch_approveReverts() public {
        nft.hatch(TEST_UUID);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.approve(makeAddr("operator"), 1);
    }

    function test_hatch_setApprovalForAllReverts() public {
        nft.hatch(TEST_UUID);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.setApprovalForAll(makeAddr("operator"), true);
    }

    // -------------------------------------------------------------------------
    // Vector integration (WyHash parity)
    // -------------------------------------------------------------------------

    function test_hatch_vectorSample_matchesStoredSeedAndTraits() public {
        // Hardcoded from test/vectors/wyhash-vectors.json (category: "real-uuid")
        string[3] memory uuids = [
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-000000000003"
        ];
        uint32[3] memory expectedSeeds = [
            uint32(712111263),
            uint32(2763609465),
            uint32(2916736361)
        ];

        for (uint256 i = 0; i < 3; i++) {
            uint256 tokenId = nft.hatch(uuids[i]);

            // Seed parity
            assertEq(nft.buddyPrngSeed(tokenId), expectedSeeds[i]);

            // Traits parity — derive from expected seed and compare
            (
                uint8 species, uint8 rarity, uint8 eyes, uint8 hat, bool shiny,
                uint8 debugging, uint8 patience, uint8 chaos, uint8 wisdom, uint8 snark
            ) = Mulberry32.deriveTraits(expectedSeeds[i]);

            IBuddyNFT.BuddyTraits memory traits = nft.buddyTraits(tokenId);
            assertEq(traits.species, species);
            assertEq(traits.rarity, rarity);
            assertEq(traits.eyes, eyes);
            assertEq(traits.hat, hat);
            assertEq(traits.shiny, shiny);
            assertEq(traits.debugging, debugging);
            assertEq(traits.patience, patience);
            assertEq(traits.chaos, chaos);
            assertEq(traits.wisdom, wisdom);
            assertEq(traits.snark, snark);
        }
    }

    // -------------------------------------------------------------------------
    // tokenURI integration
    // -------------------------------------------------------------------------

    function test_hatch_tokenURIRevertsRendererNotSet() public {
        // nft was deployed with renderer=address(0)
        uint256 tokenId = nft.hatch(TEST_UUID);

        vm.expectRevert(BuddyNFT.RendererNotSet.selector);
        nft.tokenURI(tokenId);
    }

    function test_hatch_tokenURIPassthrough() public {
        MockRenderer mockRenderer = new MockRenderer();

        // Deploy a new contract with the mock renderer
        BuddyNFT nftWithRenderer = new BuddyNFT(owner, address(mockRenderer));
        uint256 tokenId = nftWithRenderer.hatch(TEST_UUID);

        // Verify renderer receives correct args: (address(nftWithRenderer), tokenId)
        vm.expectCall(
            address(mockRenderer),
            abi.encodeCall(IBuddyRenderer.tokenURI, (address(nftWithRenderer), tokenId))
        );
        string memory uri = nftWithRenderer.tokenURI(tokenId);
        assertEq(uri, "mock");
    }

    // -------------------------------------------------------------------------
    // Permissionless property
    // -------------------------------------------------------------------------

    function test_hatch_anyoneCanHatch() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        uint256 tokenId = nft.hatch(TEST_UUID);
        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), address(nft));
    }

    function test_hatch_hatcherIsCallerNotOwner() public {
        // Owner hatches
        vm.prank(owner);
        uint256 tokenId1 = nft.hatch(TEST_UUID);
        assertEq(nft.hatcher(tokenId1), owner);

        // Stranger hatches a different UUID
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        uint256 tokenId2 = nft.hatch("f47ac10b-58cc-4372-a567-0e02b2c3d479");
        assertEq(nft.hatcher(tokenId2), stranger);
    }
}

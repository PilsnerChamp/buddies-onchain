// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";
import {WyHash} from "../contracts/libraries/WyHash.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {IBuddyRenderer} from "../contracts/interfaces/IBuddyRenderer.sol";

/// @dev Minimal mock renderer for tokenURI passthrough tests.
contract MockRenderer is IBuddyRenderer {
    function tokenURI(address, uint256) external pure returns (string memory) {
        return "mock";
    }
}

contract BuddyNFTHatchTest is Test, HatchHelper {
    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher);

    BuddyNFT internal nft;
    address internal owner;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant SEED_DOMAIN = "buddies-onchain:trait-seed:v2";

    function setUp() public {
        owner = makeAddr("owner");
        nft = new BuddyNFT(owner, address(0));
    }

    // -------------------------------------------------------------------------
    // Happy path / stored state
    // -------------------------------------------------------------------------

    function test_hatch_success() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(tokenId, 1);
    }

    function test_hatch_emitsEvent() public {
        bytes32 identityHash = _identityHash(TEST_UUID);

        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(1, identityHash, address(this));

        _hatchUuid(nft, TEST_UUID);
    }

    function test_hatch_mintsToContractCustody() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.ownerOf(tokenId), address(nft));
    }

    function test_hatch_setsCustodialStage() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Custodial));
    }

    function test_hatch_storesIdentityHash() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.buddyIdentityHash(tokenId), _identityHash(TEST_UUID));
    }

    function test_hatch_storesPrngSeedFromCanonicalPipeline() public {
        uint32 expectedSeed = WyHash.hash(abi.encodePacked(_identityHash(TEST_UUID)), bytes(SEED_DOMAIN));
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.buddyPrngSeed(tokenId), expectedSeed);
    }

    function test_hatch_storesTraitsMatchingCanonicalPipeline() public {
        uint32 seed = WyHash.hash(abi.encodePacked(_identityHash(TEST_UUID)), bytes(SEED_DOMAIN));
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

        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
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
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.hatcher(tokenId), address(this));

        // Third party hatches a different UUID
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        uint256 tokenId2 = _hatchUuid(nft, "f47ac10b-58cc-4372-a567-0e02b2c3d479");
        assertEq(nft.hatcher(tokenId2), stranger);
    }

    function test_hatch_incrementsTokenId() public {
        uint256 id1 = _hatchUuid(nft, "00000000-0000-4000-8000-000000000001");
        uint256 id2 = _hatchUuid(nft, "00000000-0000-4000-8000-000000000002");
        uint256 id3 = _hatchUuid(nft, "00000000-0000-4000-8000-000000000003");

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }

    function test_hatch_nameIsEmpty() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.buddyName(tokenId), "");
    }

    // -------------------------------------------------------------------------
    // Uniqueness / replay
    // -------------------------------------------------------------------------

    function test_hatch_revertsAlreadyHatched() public {
        _hatchUuid(nft, TEST_UUID);

        vm.expectRevert(BuddyNFT.AlreadyHatched.selector);
        _hatchUuid(nft, TEST_UUID);
    }

    // -------------------------------------------------------------------------
    // Identity-hash validation
    // -------------------------------------------------------------------------

    function test_hatch_revertsInvalidIdentityHash_zero() public {
        vm.expectRevert(BuddyNFT.InvalidIdentityHash.selector);
        nft.hatch(bytes32(0));
    }

    // Note: v4 variant/shape acceptance is no longer an on-chain responsibility
    // (the contract is hash-only). That coverage lives in the shared validator
    // test `plugin/test/identity-hash.test.ts` (SOLIDITY_VALID/INVALID_V4_CASES).

    // -------------------------------------------------------------------------
    // Soulbound / invariants
    // -------------------------------------------------------------------------

    function test_hatch_transferFromContractReverts() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        address someWallet = makeAddr("someWallet");

        // External caller has no approval — the soulbound enforcement for
        // custodial tokens is that approve() and setApprovalForAll() revert
        // Soulbound(), so nobody can gain transfer authorization. The _update
        // gate allows from==address(this) && stage==Custodial (the bond path),
        // but OZ's auth check blocks unauthorized callers first.
        vm.prank(someWallet);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, someWallet, tokenId));
        nft.transferFrom(address(nft), someWallet, tokenId);
    }

    // -------------------------------------------------------------------------
    // tokenURI integration
    // -------------------------------------------------------------------------

    function test_hatch_tokenURIRevertsRendererNotSet() public {
        // nft was deployed with renderer=address(0)
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);

        vm.expectRevert(BuddyNFT.RendererNotSet.selector);
        nft.tokenURI(tokenId);
    }

    function test_hatch_tokenURIPassthrough() public {
        MockRenderer mockRenderer = new MockRenderer();

        // Deploy a new contract with the mock renderer
        BuddyNFT nftWithRenderer = new BuddyNFT(owner, address(mockRenderer));
        uint256 tokenId = _hatchUuid(nftWithRenderer, TEST_UUID);

        // Verify renderer receives correct args: (address(nftWithRenderer), tokenId)
        vm.expectCall(
            address(mockRenderer), abi.encodeCall(IBuddyRenderer.tokenURI, (address(nftWithRenderer), tokenId))
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
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(tokenId, 1);
        assertEq(nft.ownerOf(tokenId), address(nft));
    }

    function test_hatch_hatcherIsCallerNotOwner() public {
        // Owner hatches
        vm.prank(owner);
        uint256 tokenId1 = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.hatcher(tokenId1), owner);

        // Stranger hatches a different UUID
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        uint256 tokenId2 = _hatchUuid(nft, "f47ac10b-58cc-4372-a567-0e02b2c3d479");
        assertEq(nft.hatcher(tokenId2), stranger);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {IBuddyRenderer} from "../contracts/interfaces/IBuddyRenderer.sol";

/// @dev Minimal mock renderer for tokenURI passthrough tests.
contract MockRenderer is IBuddyRenderer {
    function tokenURI(address, uint256) external pure returns (string memory) {
        return "mock";
    }
}

contract BuddyNFTHatchTest is Test, HatchHelper {
    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher, bytes16 provider);

    BuddyNFT internal nft;
    address internal owner;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant ROBOT_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
    uint32 internal constant ROBOT_SEED = 2_990_586_173;

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
        emit Awakened(1, identityHash, address(this), CLAUDE_PROVIDER);

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
        uint32 expectedSeed = _prngSeed(TEST_UUID);
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.buddyPrngSeed(tokenId), expectedSeed);
    }

    function test_hatch_storesTraitsMatchingCanonicalPipeline() public {
        uint32 seed = _prngSeed(TEST_UUID);
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

    function test_hatch_acceptsZeroPrngSeedAndStoresDerivedTraits() public {
        uint256 tokenId = nft.hatch(_identityHash(TEST_UUID), 0, CLAUDE_PROVIDER);

        assertEq(nft.buddyPrngSeed(tokenId), 0);

        IBuddyNFT.BuddyTraits memory traits = nft.buddyTraits(tokenId);
        assertLt(traits.species, 18);
        assertLt(traits.rarity, 5);
        assertLt(traits.eyes, 6);
        assertLt(traits.hat, 8);
        assertGt(traits.debugging, 0);
        assertGt(traits.patience, 0);
        assertGt(traits.chaos, 0);
        assertGt(traits.wisdom, 0);
        assertGt(traits.snark, 0);
        assertLe(traits.debugging, 100);
        assertLe(traits.patience, 100);
        assertLe(traits.chaos, 100);
        assertLe(traits.wisdom, 100);
        assertLe(traits.snark, 100);
    }

    function test_hatch_robotGoldenAnchor_preservesMainTraitBones() public {
        assertEq(_prngSeed(ROBOT_UUID), ROBOT_SEED, "main robot seed anchor");

        uint256 tokenId = _hatchUuid(nft, ROBOT_UUID);
        IBuddyNFT.BuddyTraits memory traits = nft.buddyTraits(tokenId);

        assertEq(nft.buddyPrngSeed(tokenId), ROBOT_SEED);
        assertEq(traits.rarity, 3, "epic");
        assertEq(traits.species, 14, "robot");
        assertEq(traits.eyes, 2, "x eyes");
        assertEq(traits.hat, 0, "hatless");
        assertFalse(traits.shiny, "not shiny");
        assertEq(traits.debugging, 44);
        assertEq(traits.patience, 63);
        assertEq(traits.chaos, 54);
        assertEq(traits.wisdom, 32);
        assertEq(traits.snark, 87);
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
        nft.hatch(bytes32(0), _prngSeed(TEST_UUID), CLAUDE_PROVIDER);
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

    // -------------------------------------------------------------------------
    // Provider
    // -------------------------------------------------------------------------

    function test_hatch_storesProvider() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.buddyProvider(tokenId), CLAUDE_PROVIDER);
    }

    function test_hatch_acceptsFullSixteenByteProvider() public {
        bytes16 provider = "abcdefgh12345678";
        uint256 tokenId = nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), provider);
        assertEq(nft.buddyProvider(tokenId), provider);
    }

    function test_hatch_acceptsHyphenAndDigits() public {
        bytes16 provider = "gpt-4o-2024";
        uint256 tokenId = nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), provider);
        assertEq(nft.buddyProvider(tokenId), provider);
    }

    function test_hatch_emitsProvider() public {
        bytes16 provider = "codex";
        bytes32 identityHash = _identityHash(TEST_UUID);

        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(1, identityHash, address(this), provider);

        nft.hatch(identityHash, _prngSeed(TEST_UUID), provider);
    }

    function test_hatch_revertsProviderAllZero() public {
        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), bytes16(0));
    }

    function test_hatch_revertsProviderUppercase() public {
        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), "Claude");
    }

    function test_hatch_revertsProviderControlByte() public {
        // Leading byte 0x01 is below the printable range.
        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), bytes16(hex"01000000000000000000000000000000"));
    }

    function test_hatch_revertsProviderQuoteByte() public {
        // Double-quote (0x22) would break JSON when later threaded into metadata.
        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), bytes16(hex"22000000000000000000000000000000"));
    }

    function test_hatch_revertsProviderInteriorNull() public {
        // "abc\x00def" padded — a non-null byte follows an interior null.
        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), bytes16(hex"61626300646566000000000000000000"));
    }

    function test_hatch_revertsProviderInvalidSymbol() public {
        // Underscore (0x5f) is not in [a-z0-9-].
        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), "claude_v1");
    }

    function test_hatch_acceptsClaudeNullPadded() public {
        // "claude" left-aligned, null-padded tail — the v1 canonical value.
        bytes16 provider = "claude";
        assertEq(provider, bytes16(hex"636c6175646500000000000000000000"), "claude null-padded layout");
        uint256 tokenId = nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), provider);
        assertEq(nft.buddyProvider(tokenId), provider);
    }

    // Fence-post coverage for _validateProvider: bytes adjacent to the accepted
    // ranges [a-z]=0x61-0x7a, [0-9]=0x30-0x39, '-'=0x2d, plus the high-bit edge.
    function test_hatch_revertsProviderBacktick() public {
        _assertProviderByteReverts(0x60); // one below 'a'
    }

    function test_hatch_revertsProviderOpenBrace() public {
        _assertProviderByteReverts(0x7b); // one above 'z'
    }

    function test_hatch_revertsProviderSlash() public {
        _assertProviderByteReverts(0x2f); // one below '0'
    }

    function test_hatch_revertsProviderColon() public {
        _assertProviderByteReverts(0x3a); // one above '9'
    }

    function test_hatch_revertsProviderHighBit() public {
        _assertProviderByteReverts(0x80); // above 7-bit ascii
    }

    /// @dev Places `b` as the leading provider byte (null-padded tail) and
    ///      asserts hatch reverts InvalidProvider.
    function _assertProviderByteReverts(uint8 b) internal {
        bytes16 provider = bytes16(bytes1(b));
        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), provider);
    }
}

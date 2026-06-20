// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {ClaimAttestationHelper} from "./helpers/ClaimAttestationHelper.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

contract BuddyNFTERC721ConformanceTest is Test, HatchHelper {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    BuddyNFT internal nft;
    address internal owner;
    uint256 internal signerPk;
    address internal signer;
    address internal recipient;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant BOND_NAME = "buddy";

    function setUp() public {
        owner = makeAddr("owner");
        (signer, signerPk) = makeAddrAndKey("signer");
        recipient = makeAddr("recipient");

        nft = new BuddyNFT(owner, address(0));

        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.enableBonding();
        vm.stopPrank();
    }

    function test_supportsInterface_erc165() public view {
        assertTrue(nft.supportsInterface(0x01ffc9a7));
    }

    function test_supportsInterface_erc721() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd));
    }

    function test_supportsInterface_erc721Metadata() public view {
        assertTrue(nft.supportsInterface(0x5b5e139f));
    }

    function test_supportsInterface_erc4906() public view {
        assertTrue(nft.supportsInterface(0x49064906));
    }

    function test_supportsInterface_erc5192() public view {
        assertTrue(nft.supportsInterface(0xb45a3c0e));
    }

    function test_supportsInterface_eip2981RoyaltiesUnsupported() public view {
        assertFalse(nft.supportsInterface(0x2a55205a));
    }

    function test_supportsInterface_unknownReturnsFalse() public view {
        assertFalse(nft.supportsInterface(0x12345678));
    }

    function test_supportsInterface_erc165BadFuncReturnsFalse() public view {
        assertFalse(nft.supportsInterface(0xffffffff));
    }

    function test_metadata_nameAndSymbol() public view {
        assertEq(nft.name(), "Buddies Onchain");
        assertEq(nft.symbol(), "BUDDY");
    }

    function test_tokenURI_revertsForNonexistentToken() public {
        uint256 tokenId = 999;

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        nft.tokenURI(tokenId);
    }

    function test_locked_revertsForNonexistentToken() public {
        uint256 tokenId = 999;

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        nft.locked(tokenId);
    }

    function test_ownership_balanceAndOwnerAfterHatch_custodial() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);

        assertEq(nft.balanceOf(address(nft)), 1);
        assertEq(nft.ownerOf(tokenId), address(nft));
    }

    function test_locked_stageMatrix_custodialFalseBondedTrue() public {
        (uint256 tokenId,, BuddyNFT.ClaimAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signClaimAttestation(att);

        assertFalse(nft.locked(tokenId));

        vm.prank(recipient);
        nft.claim(att, sig);

        assertTrue(nft.locked(tokenId));
    }

    function test_ownership_balanceAfterClaim_bonded() public {
        uint256 tokenId = _hatchAndClaim();

        assertEq(nft.balanceOf(recipient), 1);
        assertEq(nft.balanceOf(address(nft)), 0);
        assertEq(nft.ownerOf(tokenId), recipient);
    }

    function test_approve_revertsSoulbound_custodial() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.approve(makeAddr("approved"), tokenId);
    }

    function test_approve_revertsSoulbound_bonded() public {
        uint256 tokenId = _hatchAndClaim();

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        nft.approve(makeAddr("approved"), tokenId);
    }

    function test_setApprovalForAll_revertsSoulbound_custodial() public {
        _hatchUuid(nft, TEST_UUID);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.setApprovalForAll(makeAddr("operator"), true);
    }

    function test_setApprovalForAll_revertsSoulbound_bonded() public {
        _hatchAndClaim();

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        nft.setApprovalForAll(makeAddr("operator"), true);
    }

    function test_getApproved_returnsZero_custodial() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);

        assertEq(nft.getApproved(tokenId), address(0));
    }

    function test_getApproved_returnsZero_bonded() public {
        uint256 tokenId = _hatchAndClaim();

        assertEq(nft.getApproved(tokenId), address(0));
    }

    function test_isApprovedForAll_returnsFalse() public {
        assertFalse(nft.isApprovedForAll(makeAddr("approvalOwner"), makeAddr("operator")));
    }

    function test_hatch_emitsTransferEvent() public {
        vm.expectEmit(true, true, true, false, address(nft));
        emit Transfer(address(0), address(nft), 1);

        _hatchUuid(nft, TEST_UUID);
    }

    function test_claim_emitsTransferEvent() public {
        (uint256 tokenId,, BuddyNFT.ClaimAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signClaimAttestation(att);

        vm.expectEmit(true, true, true, false, address(nft));
        emit Transfer(address(nft), recipient, tokenId);

        vm.prank(recipient);
        nft.claim(att, sig);
    }

    function _signClaimAttestation(BuddyNFT.ClaimAttestation memory att) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ClaimAttestationHelper.digest(address(nft), att));
        return abi.encodePacked(r, s, v);
    }

    function _hatchAndPrepare()
        internal
        returns (uint256 tokenId, bytes32 identityHash, BuddyNFT.ClaimAttestation memory att)
    {
        tokenId = _hatchUuid(nft, TEST_UUID);
        identityHash = _identityHash(TEST_UUID);
        att = BuddyNFT.ClaimAttestation({
            identityHash: identityHash,
            prngSeed: _prngSeed(TEST_UUID),
            provider: CLAUDE_PROVIDER,
            name: BOND_NAME,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _hatchAndClaim() internal returns (uint256 tokenId) {
        BuddyNFT.ClaimAttestation memory att;
        (tokenId,, att) = _hatchAndPrepare();
        bytes memory sig = _signClaimAttestation(att);

        vm.prank(recipient);
        nft.claim(att, sig);
    }
}

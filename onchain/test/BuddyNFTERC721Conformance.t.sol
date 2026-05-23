// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";

contract BuddyNFTERC721ConformanceTest is Test {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    bytes32 private constant BOND_ATTESTATION_TYPEHASH =
        keccak256("BondAttestation(uint256 tokenId,bytes32 identityHash,address recipient,uint64 expiry)");

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

    function test_ownership_balanceAndOwnerAfterHatch_custodial() public {
        uint256 tokenId = nft.hatch(TEST_UUID);

        assertEq(nft.balanceOf(address(nft)), 1);
        assertEq(nft.ownerOf(tokenId), address(nft));
    }

    function test_ownership_balanceAfterBond_bonded() public {
        uint256 tokenId = _hatchAndBond();

        assertEq(nft.balanceOf(recipient), 1);
        assertEq(nft.balanceOf(address(nft)), 0);
        assertEq(nft.ownerOf(tokenId), recipient);
    }

    function test_approve_revertsSoulbound_custodial() public {
        uint256 tokenId = nft.hatch(TEST_UUID);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.approve(makeAddr("approved"), tokenId);
    }

    function test_approve_revertsSoulbound_bonded() public {
        uint256 tokenId = _hatchAndBond();

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        nft.approve(makeAddr("approved"), tokenId);
    }

    function test_setApprovalForAll_revertsSoulbound_custodial() public {
        nft.hatch(TEST_UUID);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.setApprovalForAll(makeAddr("operator"), true);
    }

    function test_setApprovalForAll_revertsSoulbound_bonded() public {
        _hatchAndBond();

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        nft.setApprovalForAll(makeAddr("operator"), true);
    }

    function test_getApproved_returnsZero_custodial() public {
        uint256 tokenId = nft.hatch(TEST_UUID);

        assertEq(nft.getApproved(tokenId), address(0));
    }

    function test_getApproved_returnsZero_bonded() public {
        uint256 tokenId = _hatchAndBond();

        assertEq(nft.getApproved(tokenId), address(0));
    }

    function test_isApprovedForAll_returnsFalse() public {
        assertFalse(nft.isApprovedForAll(makeAddr("approvalOwner"), makeAddr("operator")));
    }

    function test_hatch_emitsTransferEvent() public {
        vm.expectEmit(true, true, true, false, address(nft));
        emit Transfer(address(0), address(nft), 1);

        nft.hatch(TEST_UUID);
    }

    function test_bond_emitsTransferEvent() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        vm.expectEmit(true, true, true, false, address(nft));
        emit Transfer(address(nft), recipient, tokenId);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("BuddyNFT"),
                keccak256("1"),
                block.chainid,
                address(nft)
            )
        );
    }

    function _hashAttestation(BuddyNFT.BondAttestation memory att) internal pure returns (bytes32) {
        return
            keccak256(abi.encode(BOND_ATTESTATION_TYPEHASH, att.tokenId, att.identityHash, att.recipient, att.expiry));
    }

    function _computeDigest(bytes32 structHash) internal view returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(_domainSeparator(), structHash);
    }

    function _signBondAttestation(BuddyNFT.BondAttestation memory att) internal view returns (bytes memory) {
        bytes32 digest = _computeDigest(_hashAttestation(att));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hatchAndPrepare()
        internal
        returns (uint256 tokenId, bytes32 identityHash, BuddyNFT.BondAttestation memory att)
    {
        tokenId = nft.hatch(TEST_UUID);
        identityHash = keccak256(bytes(TEST_UUID));
        att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _hatchAndBond() internal returns (uint256 tokenId) {
        BuddyNFT.BondAttestation memory att;
        (tokenId,, att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }
}

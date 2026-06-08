// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BondAttestationHelper} from "./helpers/BondAttestationHelper.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

contract BuddyNFTBondTest is Test, HatchHelper {
    event BuddyBonded(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed recipient, string name);

    BuddyNFT internal nft;
    address internal owner;
    uint256 internal signerPk;
    address internal signer;
    address internal recipient;
    uint256 internal recipientPk;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant BOND_NAME = "buddy";

    function setUp() public {
        owner = makeAddr("owner");
        (signer, signerPk) = makeAddrAndKey("signer");
        (recipient, recipientPk) = makeAddrAndKey("recipient");

        nft = new BuddyNFT(owner, address(0));

        // Set attestation signer and enable bonding
        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.enableBonding();
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // EIP-712 signing helpers — domain/struct hashing lives in
    // `helpers/BondAttestationHelper.sol`. Per-suite signing stays inline
    // because it needs the `vm.sign` cheatcode.
    // -------------------------------------------------------------------------

    function _signBondAttestation(BuddyNFT.BondAttestation memory att) internal view returns (bytes memory) {
        return _signBondAttestationWithKey(att, signerPk);
    }

    function _signBondAttestationWithKey(BuddyNFT.BondAttestation memory att, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, BondAttestationHelper.digest(address(nft), att));
        return abi.encodePacked(r, s, v);
    }

    function _hatchAndPrepare()
        internal
        returns (uint256 tokenId, bytes32 identityHash, BuddyNFT.BondAttestation memory att)
    {
        tokenId = _hatchUuid(nft, TEST_UUID);
        identityHash = _identityHash(TEST_UUID);
        att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------

    function test_bond_success() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);

        assertEq(nft.ownerOf(tokenId), recipient);
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded));
        assertEq(nft.buddyName(tokenId), BOND_NAME);
    }

    function test_bond_emitsEvent() public {
        (uint256 tokenId, bytes32 identityHash, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        vm.expectEmit(true, true, true, true, address(nft));
        emit BuddyBonded(tokenId, identityHash, recipient, BOND_NAME);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_nameStoredOnlyAtBond() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        // Name is empty before bond
        assertEq(nft.buddyName(tokenId), "");

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);

        // Name is set after bond
        assertEq(nft.buddyName(tokenId), BOND_NAME);
    }

    // -------------------------------------------------------------------------
    // Revert conditions
    // -------------------------------------------------------------------------

    function test_bond_revertsBondingNotEnabled() public {
        // Deploy fresh contract without enabling bonding
        BuddyNFT freshNft = new BuddyNFT(owner, address(0));
        uint256 tokenId = _hatchUuid(freshNft, TEST_UUID);
        bytes32 identityHash = _identityHash(TEST_UUID);

        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });

        vm.expectRevert(BuddyNFT.BondingNotEnabled.selector);
        vm.prank(recipient);
        freshNft.bond(tokenId, BOND_NAME, att, new bytes(65));
    }

    function test_bond_revertsNonexistentToken() public {
        uint256 fakeTokenId = 999;
        bytes32 fakeHash = keccak256("fake");

        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: fakeTokenId,
            identityHash: fakeHash,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, fakeTokenId));
        vm.prank(recipient);
        nft.bond(fakeTokenId, BOND_NAME, att, new bytes(65));
    }

    function test_bond_revertsAlreadyBonded() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);

        // Second bond attempt — stage is now Bonded
        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        nft.bond(tokenId, "name2", att, sig);
    }

    function test_bond_revertsAtStageCheckAfterBond() public {
        // The stage check (Soulbound) must fire BEFORE any attestation-field
        // validation. After a successful bond, a second bond carrying a
        // deliberately INVALID attestation (a mismatched tokenId — the FIRST field
        // check) must still revert Soulbound — NOT InvalidAttestation — proving the
        // stage gate precedes attestation validation. This is what distinguishes it
        // from test_bond_revertsAlreadyBonded, which re-bonds with a VALID attestation.
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);

        // Tamper the attestation's tokenId — the FIRST attestation-field check in
        // bond() (before identityHash/recipient/expiry/signature). The call still
        // passes the real tokenId, so ownership and the stage gate operate on the
        // bonded token; only the attestation field is wrong. Re-signed so the
        // signature is valid for the tampered fields — isolating the revert cause to
        // the stage gate vs the first field check, never the signature (checked last).
        BuddyNFT.BondAttestation memory tampered = att;
        tampered.tokenId = tokenId + 1;
        bytes memory tamperedSig = _signBondAttestation(tampered);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        nft.bond(tokenId, "name2", tampered, tamperedSig);
    }

    function test_bond_revertsTokenIdMismatch() public {
        (uint256 tokenId, bytes32 identityHash,) = _hatchAndPrepare();

        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId + 1, // wrong tokenId
            identityHash: identityHash,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
        bytes memory sig = _signBondAttestation(att);

        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsIdentityHashMismatch() public {
        (uint256 tokenId,,) = _hatchAndPrepare();

        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: keccak256("wrong"), // wrong hash
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
        bytes memory sig = _signBondAttestation(att);

        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsRecipientMismatch() public {
        (uint256 tokenId, bytes32 identityHash,) = _hatchAndPrepare();
        address wrongRecipient = makeAddr("wrongRecipient");

        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            recipient: wrongRecipient, // wrong recipient
            expiry: uint64(block.timestamp + 1 hours)
        });
        bytes memory sig = _signBondAttestation(att);

        // msg.sender == recipient, but att.recipient == wrongRecipient
        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsExpiredAttestation() public {
        (uint256 tokenId, bytes32 identityHash,) = _hatchAndPrepare();

        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            recipient: recipient,
            expiry: uint64(block.timestamp - 1) // expired
        });
        bytes memory sig = _signBondAttestation(att);

        vm.expectRevert(BuddyNFT.AttestationExpired.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsInvalidSignature() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        // Sign with wrong key (recipientPk instead of signerPk)
        bytes memory sig = _signBondAttestationWithKey(att, recipientPk);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsWrongSigner() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        // Create a valid signature but from a different signer
        (, uint256 wrongPk) = makeAddrAndKey("wrongSigner");
        bytes memory sig = _signBondAttestationWithKey(att, wrongPk);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsNameTooLong() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        // MAX_NAME_LENGTH is 14; use 15 chars
        string memory longName = "123456789012345";

        vm.expectRevert(abi.encodeWithSelector(BuddyNFT.NameTooLong.selector, 15));
        vm.prank(recipient);
        nft.bond(tokenId, longName, att, sig);
    }

    // -------------------------------------------------------------------------
    // EIP-712 domain tests
    // -------------------------------------------------------------------------

    function test_bond_revertsWrongChainId() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        // Sign under a different chainId
        bytes32 digest = BondAttestationHelper.digestFor(block.chainid + 1, address(nft), att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsWrongVerifyingContract() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        // Sign for a different contract address
        bytes32 digest = BondAttestationHelper.digestFor(block.chainid, address(0xdead), att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_revertsHighSMalleability() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        bytes32 digest = BondAttestationHelper.digest(address(nft), att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

        // Flip s to high-s: s' = secp256k1n - s
        uint256 secp256k1n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(secp256k1n - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;

        bytes memory sig = abi.encodePacked(r, highS, flippedV);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    // -------------------------------------------------------------------------
    // Malformed signature edge cases
    // -------------------------------------------------------------------------

    function test_bond_revertsEmptySignature() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, "");
    }

    function test_bond_revertsShortSignature() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, new bytes(64));
    }

    function test_bond_revertsLongSignature() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, new bytes(66));
    }

    function test_bond_revertsAllZeroSignature() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, new bytes(65));
    }

    // -------------------------------------------------------------------------
    // Soulbound after bond
    // -------------------------------------------------------------------------

    function test_bond_transferAfterBondReverts() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);

        // Bonded token: from=recipient (not address(this)), stage=Bonded
        // _update gate: from != address(0), from != address(this) → revert Soulbound
        address dest = makeAddr("dest");
        vm.prank(recipient);
        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.transferFrom(recipient, dest, tokenId);
    }

    // -------------------------------------------------------------------------
    // Admin interaction — signer rotation
    // -------------------------------------------------------------------------

    function test_bond_signerRotationInvalidatesOldAttestations() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();
        bytes memory sig = _signBondAttestation(att); // signed by old signer

        // Rotate signer
        (address newSigner,) = makeAddrAndKey("newSigner");
        vm.prank(owner);
        nft.setAttestationSigner(newSigner);

        // Old signature no longer valid
        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_bond_signerRotationNewSignerWorks() public {
        (uint256 tokenId,, BuddyNFT.BondAttestation memory att) = _hatchAndPrepare();

        // Rotate signer
        (address newSigner, uint256 newSignerPk) = makeAddrAndKey("newSigner");
        vm.prank(owner);
        nft.setAttestationSigner(newSigner);

        // Sign with new key
        bytes memory sig = _signBondAttestationWithKey(att, newSignerPk);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, att, sig);

        assertEq(nft.ownerOf(tokenId), recipient);
    }
}

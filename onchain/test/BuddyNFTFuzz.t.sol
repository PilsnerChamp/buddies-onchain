// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test} from "forge-std/Test.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BondAttestationHelper} from "./helpers/BondAttestationHelper.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

contract BuddyNFTFuzzTest is Test, HatchHelper {
    event AttestationSignerUpdated(address indexed signer);

    bytes16 private constant HEX_SYMBOLS = "0123456789abcdef";
    bytes1 private constant ASCII_HYPHEN = 0x2d;

    uint256 internal constant SIGNER_KEY = uint256(keccak256("hatch-coverage-fuzz-signer"));
    uint256 private constant START_TIME = 1_700_000_000;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant SECOND_UUID = "00000000-0000-4000-8000-000000000002";
    string internal constant BOND_NAME = "buddy";

    BuddyNFT internal nft;
    address internal owner;
    address internal signer;
    address internal recipient;

    function setUp() public {
        vm.warp(START_TIME);

        owner = makeAddr("owner");
        signer = vm.addr(SIGNER_KEY);
        recipient = makeAddr("recipient");

        nft = _newBondingNft();
    }

    function testFuzz_hatch_validV4UuidSucceeds(bytes16 entropy) public {
        string memory uuid = _uuidV4(entropy);
        bytes32 identityHash = _identityHash(uuid);
        vm.assume(!nft.isMinted(identityHash));

        uint256 previousSupply = nft.totalSupply();
        uint256 tokenId = _hatchUuid(nft, uuid);

        assertEq(tokenId, previousSupply + 1);
        assertEq(nft.ownerOf(tokenId), address(nft));
        assertEq(nft.buddyIdentityHash(tokenId), identityHash);

        IBuddyNFT.BuddyTraits memory traits = nft.buddyTraits(tokenId);
        assertGt(traits.debugging, 0);
        assertGt(traits.patience, 0);
        assertGt(traits.chaos, 0);
        assertGt(traits.wisdom, 0);
        assertGt(traits.snark, 0);
    }

    function testFuzz_bond_nameLength(string memory name) public {
        vm.assume(bytes(name).length <= 256);

        BuddyNFT freshNft = _newBondingNft();
        (uint256 tokenId,, BuddyNFT.BondAttestation memory attestation) =
            _hatchAndPrepare(freshNft, TEST_UUID, recipient, _validExpiry());
        bytes memory signature = _signBondAttestation(freshNft, attestation);

        uint256 nameLength = bytes(name).length;
        if (nameLength > freshNft.MAX_NAME_LENGTH()) {
            vm.expectRevert(abi.encodeWithSelector(BuddyNFT.NameTooLong.selector, nameLength));
            vm.prank(recipient);
            freshNft.bond(tokenId, name, attestation, signature);
            return;
        }

        vm.prank(recipient);
        freshNft.bond(tokenId, name, attestation, signature);

        assertEq(freshNft.ownerOf(tokenId), recipient);
        assertEq(uint8(freshNft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded));
        assertEq(freshNft.buddyName(tokenId), name);
    }

    /// @dev Fuzz candidates ride in a struct (single stack slot) — six flat
    ///      params plus the per-field locals blow the legacy-codegen stack.
    struct BondFieldCandidates {
        uint256 tokenId;
        bytes32 identityHash;
        uint32 prngSeed;
        address recipient;
        uint256 expiry;
        uint8 matchMask;
    }

    function testFuzz_bond_attestationFields(BondFieldCandidates memory candidates) public {
        BuddyNFT freshNft = _newBondingNft();
        (uint256 validTokenId, bytes32 validIdentityHash,) =
            _hatchAndPrepare(freshNft, TEST_UUID, recipient, _validExpiry());

        bool tokenIdMatches = candidates.matchMask & 0x01 != 0;
        bool identityHashMatches = candidates.matchMask & 0x02 != 0;
        bool recipientMatches = candidates.matchMask & 0x04 != 0;
        bool expiryMatches = candidates.matchMask & 0x08 != 0;
        bool seedMatches = candidates.matchMask & 0x10 != 0;

        BuddyNFT.BondAttestation memory attestation = BuddyNFT.BondAttestation({
            tokenId: tokenIdMatches ? validTokenId : _differentTokenId(candidates.tokenId, validTokenId),
            identityHash: identityHashMatches
                ? validIdentityHash
                : _differentHash(candidates.identityHash, validIdentityHash),
            prngSeed: seedMatches ? _prngSeed(TEST_UUID) : _differentSeed(candidates.prngSeed, _prngSeed(TEST_UUID)),
            recipient: recipientMatches ? recipient : _differentAddress(candidates.recipient, recipient),
            expiry: expiryMatches ? _validExpiry() : _expiredExpiry(candidates.expiry)
        });
        bytes memory signature = _signBondAttestation(freshNft, attestation);

        // All four field checks (tokenId, identityHash, prngSeed, recipient)
        // precede the expiry check in bond(), so any field mismatch wins.
        if (!tokenIdMatches || !identityHashMatches || !seedMatches || !recipientMatches) {
            vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        } else if (!expiryMatches) {
            vm.expectRevert(BuddyNFT.AttestationExpired.selector);
        }

        vm.prank(recipient);
        freshNft.bond(validTokenId, BOND_NAME, attestation, signature);

        if (tokenIdMatches && identityHashMatches && seedMatches && recipientMatches && expiryMatches) {
            assertEq(freshNft.ownerOf(validTokenId), recipient);
            assertEq(freshNft.buddyName(validTokenId), BOND_NAME);
        }
    }

    function testFuzz_setAttestationSigner_accessControl(address caller, address newSigner, bool useOwner) public {
        address effectiveCaller = useOwner ? owner : caller;
        vm.assume(effectiveCaller != address(0));

        if (effectiveCaller != owner) {
            vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, effectiveCaller));
            vm.prank(effectiveCaller);
            nft.setAttestationSigner(newSigner);
            return;
        }

        vm.assume(newSigner != address(0));

        vm.expectEmit(true, false, false, true, address(nft));
        emit AttestationSignerUpdated(newSigner);

        vm.prank(owner);
        nft.setAttestationSigner(newSigner);

        assertEq(nft.attestationSigner(), newSigner);
    }

    function testFuzz_soulbound_transfersRevert_custodial(address caller, address from, address to, uint256 tokenIdSeed)
        public
    {
        BuddyNFT freshNft = _newBondingNft();
        _hatchUuid(freshNft, TEST_UUID);
        _hatchUuid(freshNft, SECOND_UUID);

        uint256 tokenId = bound(tokenIdSeed, 1, 2);
        vm.assume(caller != address(0));
        vm.assume(caller != address(freshNft));
        vm.assume(to != address(0));

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, caller, tokenId));
        vm.prank(caller);
        freshNft.transferFrom(from, to, tokenId);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, caller, tokenId));
        vm.prank(caller);
        freshNft.safeTransferFrom(from, to, tokenId);
    }

    function testFuzz_soulbound_transfersRevert_bonded(address caller, address from, address to, uint256 tokenIdSeed)
        public
    {
        BuddyNFT freshNft = _newBondingNft();
        _hatchAndBond(freshNft, TEST_UUID, recipient);
        _hatchAndBond(freshNft, SECOND_UUID, recipient);

        uint256 tokenId = bound(tokenIdSeed, 1, 2);
        vm.assume(caller != address(0));
        vm.assume(to != address(0));

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(caller);
        freshNft.transferFrom(from, to, tokenId);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(caller);
        freshNft.safeTransferFrom(from, to, tokenId);
    }

    /// @dev Deterministic case: caller is the bonded owner. OZ's _checkAuthorized passes
    ///      (msg.sender == ownerOf), so revert MUST originate in the contract's _update
    ///      override — random fuzz almost never collides caller == recipient.
    function test_soulbound_bonded_callerIsOwner_revertsViaUpdateOverride() public {
        BuddyNFT freshNft = _newBondingNft();
        _hatchAndBond(freshNft, TEST_UUID, recipient);

        address dest = makeAddr("dest");

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        freshNft.transferFrom(recipient, dest, 1);

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(recipient);
        freshNft.safeTransferFrom(recipient, dest, 1);
    }

    function _newBondingNft() internal returns (BuddyNFT freshNft) {
        freshNft = new BuddyNFT(owner, address(0));

        vm.startPrank(owner);
        freshNft.setAttestationSigner(signer);
        freshNft.enableBonding();
        vm.stopPrank();
    }

    function _hatchAndPrepare(BuddyNFT target, string memory uuid, address bondRecipient, uint64 expiry)
        internal
        returns (uint256 tokenId, bytes32 identityHash, BuddyNFT.BondAttestation memory attestation)
    {
        tokenId = _hatchUuid(target, uuid);
        identityHash = _identityHash(uuid);
        attestation = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            prngSeed: _prngSeed(uuid),
            recipient: bondRecipient,
            expiry: expiry
        });
    }

    function _hatchAndBond(BuddyNFT target, string memory uuid, address bondRecipient)
        internal
        returns (uint256 tokenId)
    {
        BuddyNFT.BondAttestation memory attestation;
        (tokenId,, attestation) = _hatchAndPrepare(target, uuid, bondRecipient, _validExpiry());
        bytes memory signature = _signBondAttestation(target, attestation);

        vm.prank(bondRecipient);
        target.bond(tokenId, BOND_NAME, attestation, signature);
    }

    function _signBondAttestation(BuddyNFT target, BuddyNFT.BondAttestation memory attestation)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(SIGNER_KEY, BondAttestationHelper.digest(address(target), attestation));
        return abi.encodePacked(r, s, v);
    }

    function _validExpiry() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    function _expiredExpiry(uint256 seed) internal view returns (uint64) {
        return uint64(bound(seed, 0, block.timestamp - 1));
    }

    function _differentTokenId(uint256 candidate, uint256 validTokenId) internal pure returns (uint256) {
        if (candidate != validTokenId) {
            return candidate;
        }
        return validTokenId + 1;
    }

    function _differentHash(bytes32 candidate, bytes32 validHash) internal pure returns (bytes32) {
        if (candidate != validHash) {
            return candidate;
        }
        return bytes32(uint256(validHash) ^ 1);
    }

    function _differentSeed(uint32 candidate, uint32 validSeed) internal pure returns (uint32) {
        if (candidate != validSeed) {
            return candidate;
        }
        return validSeed ^ 1;
    }

    function _differentAddress(address candidate, address validAddress) internal pure returns (address) {
        if (candidate != validAddress) {
            return candidate;
        }
        return address(uint160(validAddress) ^ 1);
    }

    function _uuidV4(bytes16 entropy) internal pure returns (string memory) {
        bytes memory raw = abi.encodePacked(entropy);
        raw[6] = bytes1((uint8(raw[6]) & 0x0f) | 0x40);
        raw[8] = bytes1((uint8(raw[8]) & 0x3f) | 0x80);

        bytes memory uuid = new bytes(36);
        uint256 out;
        for (uint256 i = 0; i < 16; ++i) {
            if (i == 4 || i == 6 || i == 8 || i == 10) {
                uuid[out++] = ASCII_HYPHEN;
            }

            uint8 value = uint8(raw[i]);
            uuid[out++] = HEX_SYMBOLS[value >> 4];
            uuid[out++] = HEX_SYMBOLS[value & 0x0f];
        }

        return string(uuid);
    }
}

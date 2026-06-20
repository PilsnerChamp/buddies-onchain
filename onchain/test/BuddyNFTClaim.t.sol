// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {ClaimAttestationHelper} from "./helpers/ClaimAttestationHelper.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

/// @title BuddyNFTClaimTest
/// @notice The single Stage-2 `claim()` door (supersedes the old bond + reclaimAndHatch
///         suites). Covers the four resolution branches — no-token, honest custodial,
///         wrong-seed (replace), and bonded (revert) — plus all reverts and per-branch
///         event ordering. "Invalid" means a WRONG SEED only: a wrong/missing
///         provider or name is corrected at claim WITHOUT a burn (soft metadata).
/// @dev The "signer fixture" models the off-chain attestation oracle: attested
///      identityHash + prngSeed derive from the SAME canonical UUID (signer-spec
///      invariant — never echoed from chain state). A squat hatches with a wrong
///      (non-derived) seed under the true identity hash; an honest token hatches with
///      the UUID-derived seed. C1 routing pin: honest custodial -> bond (never burn);
///      wrong-seed -> replace.
contract BuddyNFTClaimTest is Test, HatchHelper {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher, bytes16 provider);
    event Reclaimed(
        uint256 indexed oldTokenId, uint256 indexed newTokenId, bytes32 indexed identityHash, address reclaimer
    );
    event BuddyClaimed(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed recipient, string name);
    event Locked(uint256 tokenId);
    event MetadataUpdate(uint256 _tokenId);

    BuddyNFT internal nft;
    address internal owner;
    uint256 internal signerPk;
    address internal signer;
    address internal recipient;
    uint256 internal recipientPk;
    address internal squatter;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant CLAIM_NAME = "buddy";
    uint32 internal constant WRONG_SEED_XOR = 0x5eed;

    function setUp() public {
        owner = makeAddr("owner");
        (signer, signerPk) = makeAddrAndKey("signer");
        (recipient, recipientPk) = makeAddrAndKey("recipient");
        squatter = makeAddr("squatter");

        nft = new BuddyNFT(owner, address(0));

        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.enableBonding();
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Signer fixture — models the off-chain oracle. Attested values derive from
    // the canonical UUID; chain state is never the attested source.
    // -------------------------------------------------------------------------

    /// @dev Signing policy pin: the fixture only attests the UUID-derived seed.
    ///      A client-supplied seed that does not re-derive is refused.
    function _signerWouldAttestSeed(string memory uuid, uint32 requestedSeed) internal pure returns (bool) {
        return requestedSeed == _prngSeed(uuid);
    }

    function _claimAttestation(
        string memory uuid,
        bytes16 provider,
        string memory name,
        address recipient_,
        uint64 expiry
    ) internal pure returns (BuddyNFT.ClaimAttestation memory att) {
        att = BuddyNFT.ClaimAttestation({
            identityHash: _identityHash(uuid),
            prngSeed: _prngSeed(uuid),
            provider: provider,
            name: name,
            recipient: recipient_,
            expiry: expiry
        });
    }

    function _sign(BuddyNFT.ClaimAttestation memory att) internal view returns (bytes memory) {
        return _signWithKey(att, signerPk);
    }

    function _signWithKey(BuddyNFT.ClaimAttestation memory att, uint256 pk) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ClaimAttestationHelper.digest(address(nft), att));
        return abi.encodePacked(r, s, v);
    }

    function _validExpiry() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    /// @dev Squat: true identity hash, wrong (non-derived) seed.
    function _hatchSquat(string memory uuid) internal returns (uint256 tokenId) {
        vm.prank(squatter);
        tokenId = nft.hatch(_identityHash(uuid), _prngSeed(uuid) ^ WRONG_SEED_XOR, CLAUDE_PROVIDER);
    }

    // -------------------------------------------------------------------------
    // Branch 1: honest custodial (stored seed == attested seed) -> bond, no burn
    // -------------------------------------------------------------------------

    function test_claim_honestCustodial_success() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        vm.prank(recipient);
        uint256 claimed = nft.claim(att, _sign(att));

        assertEq(claimed, tokenId, "honest claim returns the existing tokenId");
        assertEq(nft.ownerOf(tokenId), recipient, "token not transferred to recipient");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "stage not Bonded");
        assertEq(nft.buddyName(tokenId), CLAIM_NAME, "name not set");
        assertEq(nft.buddyProvider(tokenId), CLAUDE_PROVIDER, "provider not set");
    }

    /// @dev C1 routing pin: honest custodial must NEVER burn — same tokenId,
    ///      no Reclaimed event. Event order: Locked -> MetadataUpdate -> BuddyClaimed.
    function test_claim_honestCustodial_eventOrderNeverBurns() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        bytes32 identityHash = _identityHash(TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        // Honest transfer out of custody (not a burn-to-zero), then the bond tail.
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(nft), recipient, tokenId);
        vm.expectEmit(false, false, false, true, address(nft));
        emit Locked(tokenId);
        vm.expectEmit(false, false, false, true, address(nft));
        emit MetadataUpdate(tokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit BuddyClaimed(tokenId, identityHash, recipient, CLAIM_NAME);

        vm.prank(recipient);
        uint256 claimed = nft.claim(att, _sign(att));
        assertEq(claimed, tokenId, "honest claim must keep the same tokenId (no burn)");
    }

    function test_claim_honestCustodial_overwritesProvider() public {
        // Hatched with a self-declared provider; the attestation corrects it at claim
        // WITHOUT a burn (provider is soft metadata, self-healing).
        vm.prank(squatter);
        uint256 tokenId = nft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID), "cursor");
        assertEq(nft.buddyProvider(tokenId), bytes16("cursor"), "precondition: hatched provider");

        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        vm.prank(recipient);
        uint256 claimed = nft.claim(att, _sign(att));

        assertEq(claimed, tokenId, "no burn on provider correction");
        assertEq(nft.buddyProvider(tokenId), CLAUDE_PROVIDER, "provider must be overwritten from attestation");
    }

    function test_claim_nameStoredOnlyAtClaim() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(nft.buddyName(tokenId), "", "name empty before claim");

        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.prank(recipient);
        nft.claim(att, _sign(att));

        assertEq(nft.buddyName(tokenId), CLAIM_NAME, "name set after claim");
    }

    function test_claim_emptyNameSucceeds() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, "", recipient, _validExpiry());

        vm.prank(recipient);
        nft.claim(att, _sign(att));

        assertEq(nft.buddyName(tokenId), "", "empty name is valid");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "stage not Bonded");
    }

    // -------------------------------------------------------------------------
    // Branch 2: no token -> mint then bond
    // -------------------------------------------------------------------------

    function test_claim_noToken_mintsThenBonds() public {
        bytes32 identityHash = _identityHash(TEST_UUID);
        assertFalse(nft.isMinted(identityHash), "precondition: not minted");

        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.prank(recipient);
        uint256 tokenId = nft.claim(att, _sign(att));

        assertEq(tokenId, 1, "first mint takes tokenId 1");
        assertEq(nft.ownerOf(tokenId), recipient, "token must be claimed to recipient");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "stage not Bonded");
        assertEq(nft.buddyIdentityHash(tokenId), identityHash, "identity hash mismatch");
        assertEq(nft.buddyPrngSeed(tokenId), _prngSeed(TEST_UUID), "seed must be the attested seed");
        assertEq(nft.buddyProvider(tokenId), CLAUDE_PROVIDER, "provider must be the attested provider");
        assertEq(nft.buddyName(tokenId), CLAIM_NAME, "name must be set");
        // _hatcher = msg.sender (the claimer), via _mintBuddy reuse.
        assertEq(nft.hatcher(tokenId), recipient, "hatcher must be the claimer");
    }

    /// @dev Event order: mint Transfer -> Awakened -> Locked -> MetadataUpdate -> BuddyClaimed.
    function test_claim_noToken_eventOrder() public {
        bytes32 identityHash = _identityHash(TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        uint256 expectedTokenId = 1;

        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(0), address(nft), expectedTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(expectedTokenId, identityHash, recipient, CLAUDE_PROVIDER);
        vm.expectEmit(false, false, false, true, address(nft));
        emit Locked(expectedTokenId);
        vm.expectEmit(false, false, false, true, address(nft));
        emit MetadataUpdate(expectedTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit BuddyClaimed(expectedTokenId, identityHash, recipient, CLAIM_NAME);

        vm.prank(recipient);
        nft.claim(att, _sign(att));
    }

    function test_claim_noToken_traitsDeriveFromAttestedSeed() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.prank(recipient);
        uint256 tokenId = nft.claim(att, _sign(att));

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
        ) = Mulberry32.deriveTraits(_prngSeed(TEST_UUID));

        IBuddyNFT.BuddyTraits memory traits = nft.buddyTraits(tokenId);
        assertEq(traits.species, species, "species mismatch");
        assertEq(traits.rarity, rarity, "rarity mismatch");
        assertEq(traits.eyes, eyes, "eyes mismatch");
        assertEq(traits.hat, hat, "hat mismatch");
        assertEq(traits.shiny, shiny, "shiny mismatch");
        assertEq(traits.snark, snark, "snark mismatch");
    }

    // -------------------------------------------------------------------------
    // Branch 3: wrong-seed custodial -> replace (burn + remint) then bond
    // -------------------------------------------------------------------------

    function test_claim_wrongSeed_replacesThenBonds() public {
        uint256 squatTokenId = _hatchSquat(TEST_UUID);
        bytes32 identityHash = _identityHash(TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        vm.prank(recipient);
        uint256 newTokenId = nft.claim(att, _sign(att));

        assertEq(newTokenId, squatTokenId + 1, "replacement must take a NEW sequential tokenId");
        assertEq(nft.ownerOf(newTokenId), recipient, "replacement must be claimed to recipient");
        assertEq(uint8(nft.getStage(newTokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "replacement not Bonded");
        assertEq(nft.buddyIdentityHash(newTokenId), identityHash, "replacement identity hash mismatch");
        assertEq(nft.buddyPrngSeed(newTokenId), _prngSeed(TEST_UUID), "replacement must carry the ATTESTED seed");
        assertEq(nft.buddyProvider(newTokenId), CLAUDE_PROVIDER, "replacement must carry the ATTESTED provider");
        assertEq(nft.buddyName(newTokenId), CLAIM_NAME, "replacement name must be set");
        assertEq(nft.hatcher(newTokenId), recipient, "replacement hatcher must be the claimer");

        // Old squat is burned.
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, squatTokenId));
        nft.ownerOf(squatTokenId);
        // Registry repointed, identity stays minted.
        assertEq(nft.getTokenIdByIdentity(identityHash), newTokenId, "lookup must repoint to new token");
        assertTrue(nft.isMinted(identityHash), "identity must stay minted");
    }

    /// @dev Event order: Reclaimed -> burn Transfer -> mint Transfer -> Awakened ->
    ///      Locked -> MetadataUpdate -> BuddyClaimed.
    function test_claim_wrongSeed_eventOrder() public {
        uint256 squatTokenId = _hatchSquat(TEST_UUID);
        bytes32 identityHash = _identityHash(TEST_UUID);
        uint256 newTokenId = squatTokenId + 1;
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        vm.expectEmit(true, true, true, true, address(nft));
        emit Reclaimed(squatTokenId, newTokenId, identityHash, recipient);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(nft), address(0), squatTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(0), address(nft), newTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(newTokenId, identityHash, recipient, CLAUDE_PROVIDER);
        vm.expectEmit(false, false, false, true, address(nft));
        emit Locked(newTokenId);
        vm.expectEmit(false, false, false, true, address(nft));
        emit MetadataUpdate(newTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit BuddyClaimed(newTokenId, identityHash, recipient, CLAIM_NAME);

        vm.prank(recipient);
        nft.claim(att, _sign(att));
    }

    function test_claim_wrongSeed_totalSupplyCountsBurnedSquat() public {
        _hatchSquat(TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        vm.prank(recipient);
        uint256 newTokenId = nft.claim(att, _sign(att));

        assertEq(newTokenId, 2, "issued-id precondition");
        assertEq(nft.totalSupply(), 2, "totalSupply counts issued ids, including the burned squat");
        assertEq(nft.balanceOf(recipient), 1, "claimer holds the live replacement");
        assertEq(nft.balanceOf(address(nft)), 0, "no token left in custody");
    }

    // -------------------------------------------------------------------------
    // Branch 4: bonded -> revert AlreadyBonded (before any seed read / replace)
    // -------------------------------------------------------------------------

    function test_claim_bonded_revertsAlreadyBonded() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.prank(recipient);
        nft.claim(att, _sign(att));

        // Second claim with a valid attestation — stage is now Bonded.
        BuddyNFT.ClaimAttestation memory att2 =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, "name2", recipient, _validExpiry());
        vm.expectRevert(BuddyNFT.AlreadyBonded.selector);
        vm.prank(recipient);
        nft.claim(att2, _sign(att2));
        assertEq(tokenId, 1, "no new token issued on a bonded replay");
    }

    /// @dev A bonded token must hit AlreadyBonded BEFORE any seed read, even when
    ///      the attestation carries a WRONG seed (which would otherwise route to
    ///      replace). Proves the stage gate precedes the seed predicate (C1).
    function test_claim_bonded_wrongSeedStillRevertsAlreadyBonded() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.prank(recipient);
        nft.claim(att, _sign(att));

        BuddyNFT.ClaimAttestation memory wrong =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, "name2", recipient, _validExpiry());
        wrong.prngSeed = _prngSeed(TEST_UUID) ^ WRONG_SEED_XOR; // wrong seed
        vm.expectRevert(BuddyNFT.AlreadyBonded.selector);
        vm.prank(recipient);
        nft.claim(wrong, _signWithKey(wrong, signerPk));

        assertEq(nft.ownerOf(tokenId), recipient, "bonded token must be untouched");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "stage unchanged");
    }

    function test_claim_replayAfterSuccess_reverts() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        bytes memory sig = _sign(att);

        vm.prank(recipient);
        nft.claim(att, sig);

        // Exact same attestation + signature — bonded state is the replay nonce.
        vm.expectRevert(BuddyNFT.AlreadyBonded.selector);
        vm.prank(recipient);
        nft.claim(att, sig);
    }

    // -------------------------------------------------------------------------
    // Reverts: pre-resolution checks (order: dormant, identity, provider, name,
    // recipient, expiry, signature)
    // -------------------------------------------------------------------------

    function test_claim_revertsBondingNotEnabled() public {
        BuddyNFT freshNft = new BuddyNFT(owner, address(0));
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        vm.expectRevert(BuddyNFT.BondingNotEnabled.selector);
        vm.prank(recipient);
        freshNft.claim(att, new bytes(65));
    }

    function test_claim_revertsZeroIdentityHash() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        att.identityHash = bytes32(0);

        vm.expectRevert(BuddyNFT.InvalidIdentityHash.selector);
        vm.prank(recipient);
        nft.claim(att, _sign(att));
    }

    function test_claim_revertsBadProvider() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, "Cl4ude!", CLAIM_NAME, recipient, _validExpiry());

        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        vm.prank(recipient);
        nft.claim(att, _sign(att));
    }

    function test_claim_revertsNameTooLong() public {
        // MAX_NAME_LENGTH is 14 bytes; 15 chars overflows.
        string memory longName = "123456789012345";
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, longName, recipient, _validExpiry());

        vm.expectRevert(abi.encodeWithSelector(BuddyNFT.NameTooLong.selector, 15));
        vm.prank(recipient);
        nft.claim(att, _sign(att));
    }

    function test_claim_nameLengthBoundaryByBytes() public {
        // A 14-byte multibyte name is OK; a 15-byte one (5 x 3-byte glyphs) is not.
        // bytes-length, NOT char count, is the gate.
        string memory fourteenBytes = unicode"abcdefghijklmn"; // 14 ascii bytes
        BuddyNFT.ClaimAttestation memory ok =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, fourteenBytes, recipient, _validExpiry());
        vm.prank(recipient);
        nft.claim(ok, _sign(ok));
        assertEq(nft.buddyName(1), fourteenBytes, "14-byte name must store");

        string memory fifteenBytes = unicode"五五五五五"; // 5 glyphs x 3 bytes = 15 bytes
        BuddyNFT.ClaimAttestation memory bad = _claimAttestation(
            "00000000-0000-4000-8000-000000000002", CLAUDE_PROVIDER, fifteenBytes, recipient, _validExpiry()
        );
        vm.expectRevert(abi.encodeWithSelector(BuddyNFT.NameTooLong.selector, 15));
        vm.prank(recipient);
        nft.claim(bad, _sign(bad));
    }

    function test_claim_revertsRecipientMismatch() public {
        address wrongRecipient = makeAddr("wrongRecipient");
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, wrongRecipient, _validExpiry());

        // msg.sender == recipient, but att.recipient == wrongRecipient.
        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(recipient);
        nft.claim(att, _sign(att));
    }

    function test_claim_revertsExpiredAttestation() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, uint64(block.timestamp - 1));

        vm.expectRevert(BuddyNFT.AttestationExpired.selector);
        vm.prank(recipient);
        nft.claim(att, _sign(att));
    }

    function test_claim_revertsInvalidSignature() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());

        // Sign with wrong key (recipientPk instead of signerPk).
        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, _signWithKey(att, recipientPk));
    }

    function test_claim_revertsWrongSigner() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        (, uint256 wrongPk) = makeAddrAndKey("wrongSigner");

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, _signWithKey(att, wrongPk));
    }

    function test_claim_signerRotationInvalidatesOldAttestations() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        bytes memory sig = _sign(att); // signed by old signer

        (address newSigner,) = makeAddrAndKey("newSigner");
        vm.prank(owner);
        nft.setAttestationSigner(newSigner);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, sig);
    }

    // -------------------------------------------------------------------------
    // EIP-712 domain binding
    // -------------------------------------------------------------------------

    function test_claim_revertsWrongChainId() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        bytes32 digest = ClaimAttestationHelper.digestFor(block.chainid + 1, address(nft), att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, abi.encodePacked(r, s, v));
    }

    function test_claim_revertsWrongVerifyingContract() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        bytes32 digest = ClaimAttestationHelper.digestFor(block.chainid, address(0xdead), att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, abi.encodePacked(r, s, v));
    }

    function test_claim_revertsHighSMalleability() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ClaimAttestationHelper.digest(address(nft), att));

        uint256 secp256k1n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 highS = bytes32(secp256k1n - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, abi.encodePacked(r, highS, flippedV));
    }

    // -------------------------------------------------------------------------
    // Malformed signature edge cases
    // -------------------------------------------------------------------------

    function test_claim_revertsEmptySignature() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, "");
    }

    function test_claim_revertsShortSignature() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, new bytes(64));
    }

    function test_claim_revertsAllZeroSignature() public {
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(recipient);
        nft.claim(att, new bytes(65));
    }

    // -------------------------------------------------------------------------
    // Soulbound after claim
    // -------------------------------------------------------------------------

    function test_claim_transferAfterClaimReverts() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.ClaimAttestation memory att =
            _claimAttestation(TEST_UUID, CLAUDE_PROVIDER, CLAIM_NAME, recipient, _validExpiry());
        vm.prank(recipient);
        nft.claim(att, _sign(att));

        address dest = makeAddr("dest");
        vm.prank(recipient);
        vm.expectRevert(BuddyNFT.Soulbound.selector);
        nft.transferFrom(recipient, dest, tokenId);
    }

    // -------------------------------------------------------------------------
    // Signer-policy fixture: only the UUID-derived seed is attestable
    // -------------------------------------------------------------------------

    function test_signerFixture_rejectsClientSuppliedSeed() public {
        uint32 derived = _prngSeed(TEST_UUID);
        assertTrue(_signerWouldAttestSeed(TEST_UUID, derived), "signer must attest the UUID-derived seed");
        assertFalse(_signerWouldAttestSeed(TEST_UUID, derived ^ 1), "signer must refuse a client-supplied seed");
    }
}

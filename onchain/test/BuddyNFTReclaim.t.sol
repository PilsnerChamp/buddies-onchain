// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test} from "forge-std/Test.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {BondAttestationHelper} from "./helpers/BondAttestationHelper.sol";
import {ReclaimAttestationHelper} from "./helpers/ReclaimAttestationHelper.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

/// @title BuddyNFTReclaimTest
/// @notice Decision-10/11 suite: seed-checked bond + atomic reclaimAndHatch.
/// @dev The "signer fixture" helpers model the off-chain attestation oracle:
///      attested identityHash and prngSeed derive from the SAME canonical UUID
///      (signer-spec invariant — never echoed from chain state). The squat
///      fixture hatches with a deliberately wrong seed under the true identity
///      hash; the honest fixture hatches with the UUID-derived seed.
contract BuddyNFTReclaimTest is Test, HatchHelper {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher, bytes16 provider);
    event Reclaimed(
        uint256 indexed oldTokenId, uint256 indexed newTokenId, bytes32 indexed identityHash, address reclaimer
    );

    BuddyNFT internal nft;
    address internal owner;
    uint256 internal signerPk;
    address internal signer;
    address internal reclaimer;
    address internal squatter;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant BOND_NAME = "buddy";
    uint32 internal constant WRONG_SEED_XOR = 0x5eed;

    function setUp() public {
        owner = makeAddr("owner");
        (signer, signerPk) = makeAddrAndKey("signer");
        reclaimer = makeAddr("reclaimer");
        squatter = makeAddr("squatter");

        nft = new BuddyNFT(owner, address(0));

        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.enableBonding();
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Signer fixture — models the off-chain attestation oracle. Attested values
    // derive from the canonical UUID; chain state is never the attested source.
    // -------------------------------------------------------------------------

    /// @dev Signing policy pin: the fixture only attests the UUID-derived seed.
    ///      A client-supplied seed that does not re-derive is refused.
    function _signerWouldAttestSeed(string memory uuid, uint32 requestedSeed) internal pure returns (bool) {
        return requestedSeed == _prngSeed(uuid);
    }

    function _signerIssueBond(string memory uuid, uint256 tokenId, address recipient_, uint64 expiry)
        internal
        view
        returns (BuddyNFT.BondAttestation memory att, bytes memory sig)
    {
        att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: _identityHash(uuid),
            prngSeed: _prngSeed(uuid),
            recipient: recipient_,
            expiry: expiry
        });
        sig = _signBondAttestation(att);
    }

    function _signerIssueReclaim(
        string memory uuid,
        uint256 tokenId,
        bytes16 provider,
        address reclaimer_,
        uint64 expiry
    ) internal view returns (BuddyNFT.ReclaimAttestation memory att, bytes memory sig) {
        att = BuddyNFT.ReclaimAttestation({
            tokenId: tokenId,
            identityHash: _identityHash(uuid),
            prngSeed: _prngSeed(uuid),
            provider: provider,
            reclaimer: reclaimer_,
            expiry: expiry
        });
        sig = _signReclaimAttestation(att);
    }

    function _signBondAttestation(BuddyNFT.BondAttestation memory att) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, BondAttestationHelper.digest(address(nft), att));
        return abi.encodePacked(r, s, v);
    }

    function _signReclaimAttestation(BuddyNFT.ReclaimAttestation memory att) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ReclaimAttestationHelper.digest(address(nft), att));
        return abi.encodePacked(r, s, v);
    }

    // -------------------------------------------------------------------------
    // Scenario fixtures
    // -------------------------------------------------------------------------

    /// @dev Squat: true identity hash, wrong (non-derived) seed.
    function _hatchSquat(string memory uuid) internal returns (uint256 tokenId) {
        vm.prank(squatter);
        tokenId = nft.hatch(_identityHash(uuid), _prngSeed(uuid) ^ WRONG_SEED_XOR, CLAUDE_PROVIDER);
    }

    function _validExpiry() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    function _squatAndIssueReclaim()
        internal
        returns (uint256 squatTokenId, BuddyNFT.ReclaimAttestation memory att, bytes memory sig)
    {
        squatTokenId = _hatchSquat(TEST_UUID);
        (att, sig) = _signerIssueReclaim(TEST_UUID, squatTokenId, CLAUDE_PROVIDER, reclaimer, _validExpiry());
    }

    // -------------------------------------------------------------------------
    // Signer fixture — both directions + client-supplied-seed refusal
    // -------------------------------------------------------------------------

    function test_signerFixture_honestBond_succeeds() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        (BuddyNFT.BondAttestation memory att, bytes memory sig) =
            _signerIssueBond(TEST_UUID, tokenId, reclaimer, _validExpiry());

        vm.prank(reclaimer);
        nft.bond(tokenId, BOND_NAME, att, sig);

        assertEq(nft.ownerOf(tokenId), reclaimer, "honest derived-seed bond must succeed");
    }

    function test_signerFixture_squatBond_reverts() public {
        // Squat hatched with a wrong seed; the signer attests the UUID-DERIVED
        // seed (never the stored one), so the contract-side equality check fails.
        uint256 tokenId = _hatchSquat(TEST_UUID);
        (BuddyNFT.BondAttestation memory att, bytes memory sig) =
            _signerIssueBond(TEST_UUID, tokenId, reclaimer, _validExpiry());

        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(reclaimer);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    function test_signerFixture_rejectsClientSuppliedSeed() public {
        uint32 derived = _prngSeed(TEST_UUID);

        // Fixture-level policy: only the UUID-derived seed is attestable.
        assertTrue(_signerWouldAttestSeed(TEST_UUID, derived), "signer must attest the UUID-derived seed");
        assertFalse(_signerWouldAttestSeed(TEST_UUID, derived ^ 1), "signer must refuse a client-supplied seed");

        // Chain backstop: even if a negligent signer signed the client-supplied
        // seed over an HONEST token, bond() still refuses on the equality check.
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: _identityHash(TEST_UUID),
            prngSeed: derived ^ 1,
            recipient: reclaimer,
            expiry: _validExpiry()
        });
        bytes memory sig = _signBondAttestation(att);

        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(reclaimer);
        nft.bond(tokenId, BOND_NAME, att, sig);
    }

    // -------------------------------------------------------------------------
    // Reclaim happy path — replacement mint, registry, provider/seed binding
    // -------------------------------------------------------------------------

    function test_reclaim_success_replacementState() public {
        (uint256 squatTokenId, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();
        bytes32 identityHash = _identityHash(TEST_UUID);
        uint32 derivedSeed = _prngSeed(TEST_UUID);

        vm.prank(reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(att, sig);

        assertEq(newTokenId, squatTokenId + 1, "replacement must take a NEW sequential tokenId");
        assertEq(nft.ownerOf(newTokenId), address(nft), "replacement must be contract-custodied");
        assertEq(
            uint8(nft.getStage(newTokenId)), uint8(IBuddyNFT.OwnershipStage.Custodial), "replacement stays custodial"
        );
        assertEq(nft.buddyIdentityHash(newTokenId), identityHash, "replacement identity hash mismatch");
        assertEq(nft.buddyPrngSeed(newTokenId), derivedSeed, "replacement must carry the ATTESTED seed");
        assertEq(nft.buddyProvider(newTokenId), CLAUDE_PROVIDER, "replacement must carry the ATTESTED provider");
        assertEq(nft.hatcher(newTokenId), reclaimer, "replacement hatcher must be the reclaimer");
        assertEq(nft.buddyName(newTokenId), "", "replacement must have no bonded name");
    }

    function test_reclaim_replacementTraitsDeriveFromAttestedSeed() public {
        (, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();

        vm.prank(reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(att, sig);

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

        IBuddyNFT.BuddyTraits memory traits = nft.buddyTraits(newTokenId);
        assertEq(traits.species, species, "species mismatch");
        assertEq(traits.rarity, rarity, "rarity mismatch");
        assertEq(traits.eyes, eyes, "eyes mismatch");
        assertEq(traits.hat, hat, "hat mismatch");
        assertEq(traits.shiny, shiny, "shiny mismatch");
        assertEq(traits.debugging, debugging, "debugging mismatch");
        assertEq(traits.patience, patience, "patience mismatch");
        assertEq(traits.chaos, chaos, "chaos mismatch");
        assertEq(traits.wisdom, wisdom, "wisdom mismatch");
        assertEq(traits.snark, snark, "snark mismatch");
    }

    function test_reclaim_providerBinding_replacementUsesAttestedProvider() public {
        // Squat self-declared one provider label; the reclaim attestation binds a
        // different one. The replacement mint must carry the ATTESTED label.
        bytes16 attestedProvider = "cursor";
        uint256 squatTokenId = _hatchSquat(TEST_UUID);
        assertEq(nft.buddyProvider(squatTokenId), CLAUDE_PROVIDER, "squat provider precondition");

        (BuddyNFT.ReclaimAttestation memory att, bytes memory sig) =
            _signerIssueReclaim(TEST_UUID, squatTokenId, attestedProvider, reclaimer, _validExpiry());

        vm.prank(reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(att, sig);

        assertEq(nft.buddyProvider(newTokenId), attestedProvider, "replacement must carry the attested provider");
    }

    function test_reclaim_zeroAttestedSeedStaysValid() public {
        // prngSeed == 0 is a VALID derived seed (consistent with hatch(); no
        // non-zero guard). Squat's stored seed is non-zero so the inverse
        // predicate passes.
        uint256 squatTokenId;
        {
            vm.prank(squatter);
            squatTokenId = nft.hatch(_identityHash(TEST_UUID), 12345, CLAUDE_PROVIDER);
        }
        BuddyNFT.ReclaimAttestation memory att = BuddyNFT.ReclaimAttestation({
            tokenId: squatTokenId,
            identityHash: _identityHash(TEST_UUID),
            prngSeed: 0,
            provider: CLAUDE_PROVIDER,
            reclaimer: reclaimer,
            expiry: _validExpiry()
        });
        bytes memory sig = _signReclaimAttestation(att);

        vm.prank(reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(att, sig);

        assertEq(nft.buddyPrngSeed(newTokenId), 0, "zero attested seed must mint a zero-seed replacement");
    }

    // -------------------------------------------------------------------------
    // Post-reclaim registry + totalSupply pins
    // -------------------------------------------------------------------------

    function test_reclaim_postReclaimRegistryTripleAssert() public {
        (uint256 squatTokenId, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();
        bytes32 identityHash = _identityHash(TEST_UUID);

        vm.prank(reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(att, sig);

        // Triple-assert: lookup repointed, registry still occupied, old id dead.
        assertEq(nft.getTokenIdByIdentity(identityHash), newTokenId, "identity lookup must repoint to new token");
        assertTrue(nft.isMinted(identityHash), "identity must stay minted after reclaim");

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, squatTokenId));
        nft.ownerOf(squatTokenId);
    }

    function test_reclaim_oldTokenReadsRevert() public {
        (uint256 squatTokenId, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();

        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);

        bytes memory expectedError = abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, squatTokenId);

        vm.expectRevert(expectedError);
        nft.buddyTraits(squatTokenId);
        vm.expectRevert(expectedError);
        nft.buddyPrngSeed(squatTokenId);
        vm.expectRevert(expectedError);
        nft.buddyProvider(squatTokenId);
        vm.expectRevert(expectedError);
        nft.buddyIdentityHash(squatTokenId);
        vm.expectRevert(expectedError);
        nft.getStage(squatTokenId);
        vm.expectRevert(expectedError);
        nft.tokenURI(squatTokenId);
        vm.expectRevert(expectedError);
        nft.hatcher(squatTokenId);
    }

    function test_reclaim_totalSupplyStaysIssuedIdCounter() public {
        (, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();

        vm.prank(reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(att, sig);

        // totalSupply() is an issued-id counter, NOT a live-token count: the
        // burned squat leaves it one above live supply. RULED: accept + disclose.
        assertEq(newTokenId, 2, "issued-id precondition");
        assertEq(nft.totalSupply(), 2, "totalSupply must count issued ids, including the burned squat");
        assertEq(nft.balanceOf(address(nft)), 1, "live custody count must exclude the burned squat");
    }

    // -------------------------------------------------------------------------
    // Event order — Reclaimed, burn Transfer, mint Transfer, Awakened
    // -------------------------------------------------------------------------

    function test_reclaim_eventOrder() public {
        (uint256 squatTokenId, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();
        bytes32 identityHash = _identityHash(TEST_UUID);
        uint256 expectedNewTokenId = squatTokenId + 1;

        vm.expectEmit(true, true, true, true, address(nft));
        emit Reclaimed(squatTokenId, expectedNewTokenId, identityHash, reclaimer);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(nft), address(0), squatTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(0), address(nft), expectedNewTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(expectedNewTokenId, identityHash, reclaimer, CLAUDE_PROVIDER);

        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    // -------------------------------------------------------------------------
    // Replacement lifecycle — bond is a separate, seed-checked step
    // -------------------------------------------------------------------------

    function test_reclaim_replacementCanBondNormally() public {
        (, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();

        vm.prank(reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(att, sig);

        (BuddyNFT.BondAttestation memory bondAtt, bytes memory bondSig) =
            _signerIssueBond(TEST_UUID, newTokenId, reclaimer, _validExpiry());

        vm.prank(reclaimer);
        nft.bond(newTokenId, BOND_NAME, bondAtt, bondSig);

        assertEq(nft.ownerOf(newTokenId), reclaimer, "replacement bond must transfer to recipient");
        assertEq(uint8(nft.getStage(newTokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "replacement must bond");
    }

    // -------------------------------------------------------------------------
    // Revert conditions
    // -------------------------------------------------------------------------

    function test_reclaim_revertsBondingNotEnabled() public {
        // Fresh contract: signer set, bonding NOT enabled.
        BuddyNFT freshNft = new BuddyNFT(owner, address(0));
        vm.prank(owner);
        freshNft.setAttestationSigner(signer);

        vm.prank(squatter);
        uint256 squatTokenId =
            freshNft.hatch(_identityHash(TEST_UUID), _prngSeed(TEST_UUID) ^ WRONG_SEED_XOR, CLAUDE_PROVIDER);

        BuddyNFT.ReclaimAttestation memory att = BuddyNFT.ReclaimAttestation({
            tokenId: squatTokenId,
            identityHash: _identityHash(TEST_UUID),
            prngSeed: _prngSeed(TEST_UUID),
            provider: CLAUDE_PROVIDER,
            reclaimer: reclaimer,
            expiry: _validExpiry()
        });

        vm.expectRevert(BuddyNFT.BondingNotEnabled.selector);
        vm.prank(reclaimer);
        freshNft.reclaimAndHatch(att, new bytes(65));
    }

    function test_reclaim_revertsHonestToken() public {
        // Inverse predicate: the attested derived seed EQUALS the stored seed on
        // an honest token, so honest tokens are structurally unreclaimable.
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        (BuddyNFT.ReclaimAttestation memory att, bytes memory sig) =
            _signerIssueReclaim(TEST_UUID, tokenId, CLAUDE_PROVIDER, reclaimer, _validExpiry());

        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsBondedToken() public {
        // Bonded tokens are unreachable: the Custodial stage gate fires before
        // any attestation-field validation.
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        (BuddyNFT.BondAttestation memory bondAtt, bytes memory bondSig) =
            _signerIssueBond(TEST_UUID, tokenId, reclaimer, _validExpiry());
        vm.prank(reclaimer);
        nft.bond(tokenId, BOND_NAME, bondAtt, bondSig);

        (BuddyNFT.ReclaimAttestation memory att, bytes memory sig) =
            _signerIssueReclaim(TEST_UUID, tokenId, CLAUDE_PROVIDER, reclaimer, _validExpiry());

        vm.expectRevert(BuddyNFT.Soulbound.selector);
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsMalformedAttestedProvider() public {
        // Replacement mints enforce the same provider charset invariant as
        // hatch(): lowercase [a-z0-9-], non-empty, null tail only. The signature
        // is valid over the malformed-provider attestation, isolating the revert
        // to the validator.
        uint256 squatTokenId = _hatchSquat(TEST_UUID);
        (BuddyNFT.ReclaimAttestation memory att, bytes memory sig) =
            _signerIssueReclaim(TEST_UUID, squatTokenId, "Cl4ude!", reclaimer, _validExpiry());

        vm.expectRevert(BuddyNFT.InvalidProvider.selector);
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsIdentityHashMismatch() public {
        uint256 squatTokenId = _hatchSquat(TEST_UUID);
        BuddyNFT.ReclaimAttestation memory att = BuddyNFT.ReclaimAttestation({
            tokenId: squatTokenId,
            identityHash: keccak256("wrong"), // wrong hash
            prngSeed: _prngSeed(TEST_UUID),
            provider: CLAUDE_PROVIDER,
            reclaimer: reclaimer,
            expiry: _validExpiry()
        });
        bytes memory sig = _signReclaimAttestation(att);

        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsReclaimerMismatch() public {
        // Leaked-signature / relayer protection: only the attested reclaimer may
        // submit, even with a perfectly valid signature.
        (, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();

        address interloper = makeAddr("interloper");
        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(interloper);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsNeverMintedTokenId() public {
        uint256 fakeTokenId = 999;
        (BuddyNFT.ReclaimAttestation memory att, bytes memory sig) =
            _signerIssueReclaim(TEST_UUID, fakeTokenId, CLAUDE_PROVIDER, reclaimer, _validExpiry());

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, fakeTokenId));
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsReplayAgainstBurnedTokenId() public {
        // The squat's per-token mappings survive its burn, so every field check
        // would still pass on a replay. _requireOwned runs FIRST and closes it
        // with ERC721NonexistentToken.
        (uint256 squatTokenId, BuddyNFT.ReclaimAttestation memory att, bytes memory sig) = _squatAndIssueReclaim();

        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);

        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, squatTokenId));
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsExpiredAttestation() public {
        uint256 squatTokenId = _hatchSquat(TEST_UUID);
        (BuddyNFT.ReclaimAttestation memory att, bytes memory sig) =
            _signerIssueReclaim(TEST_UUID, squatTokenId, CLAUDE_PROVIDER, reclaimer, uint64(block.timestamp - 1));

        vm.expectRevert(BuddyNFT.AttestationExpired.selector);
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, sig);
    }

    function test_reclaim_revertsInvalidSignature() public {
        (, BuddyNFT.ReclaimAttestation memory att,) = _squatAndIssueReclaim();

        // Valid digest, wrong key.
        (, uint256 wrongPk) = makeAddrAndKey("wrongSigner");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongPk, ReclaimAttestationHelper.digest(address(nft), att));

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, abi.encodePacked(r, s, v));
    }

    // -------------------------------------------------------------------------
    // Cross-typehash confusion — both directions
    // -------------------------------------------------------------------------

    function test_reclaim_revertsBondSignedDigest() public {
        // A signed BOND attestation over the overlapping field values must never
        // authorize a reclaim: distinct typehashes change the digest, so recovery
        // yields a non-signer address.
        (uint256 squatTokenId, BuddyNFT.ReclaimAttestation memory att,) = _squatAndIssueReclaim();

        BuddyNFT.BondAttestation memory bondTwin = BuddyNFT.BondAttestation({
            tokenId: squatTokenId,
            identityHash: att.identityHash,
            prngSeed: att.prngSeed,
            recipient: reclaimer,
            expiry: att.expiry
        });
        bytes memory bondSig = _signBondAttestation(bondTwin);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(reclaimer);
        nft.reclaimAndHatch(att, bondSig);
    }

    function test_bond_revertsReclaimSignedDigest() public {
        // Mirror direction: a signed RECLAIM attestation must never authorize a
        // bond, even with every overlapping field equal.
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.BondAttestation memory att = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: _identityHash(TEST_UUID),
            prngSeed: _prngSeed(TEST_UUID),
            recipient: reclaimer,
            expiry: _validExpiry()
        });

        BuddyNFT.ReclaimAttestation memory reclaimTwin = BuddyNFT.ReclaimAttestation({
            tokenId: tokenId,
            identityHash: att.identityHash,
            prngSeed: att.prngSeed,
            provider: CLAUDE_PROVIDER,
            reclaimer: reclaimer,
            expiry: att.expiry
        });
        bytes memory reclaimSig = _signReclaimAttestation(reclaimTwin);

        vm.expectRevert(BuddyNFT.InvalidSignature.selector);
        vm.prank(reclaimer);
        nft.bond(tokenId, BOND_NAME, att, reclaimSig);
    }
}

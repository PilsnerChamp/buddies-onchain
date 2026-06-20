// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {IBuddyNFT} from "../../contracts/interfaces/IBuddyNFT.sol";
import {ClaimAttestationHelper} from "../helpers/ClaimAttestationHelper.sol";
import {HatchHelper} from "../helpers/HatchHelper.sol";
import {SvgDecode} from "../helpers/SvgDecode.sol";

/// @title ClaimForkRehearsal
/// @notice Dress rehearsal of the single `claim()` door against the ACTUALLY DEPLOYED
///         Base Sepolia BuddyNFT. Replaces the old BondForkRehearsal + BondReclaimForkRehearsal
///         (one door now). Exercises three claim branches against deployed bytecode + config:
///           - honest custodial -> bond in place + render flip Hatched->Bonded (NEVER burns)
///           - wrong-seed custodial -> burn + remint + bond (replacement carries attested seed)
///           - bonded -> AlreadyBonded refusal (replay nonce)
///         Real reads hit deployed bytecode/config on forked chainId 84532; all writes hit the
///         local fork and are discarded — no gas, no persistent token.
/// @dev    Runnable with ONLY a fork URL — no private keys, no pasted address. The deployed
///         address loads from the `deployments/84532.json` manifest written by deploy.sh
///         (repo source of truth), and the signer is repointed locally via an owner prank, so
///         we sign with a local key. Skips cleanly (vm.skip) when the RPC env or the
///         manifest/address is absent, so `forge test` stays green pre-deploy and in CI.
///
///         Drift gates that DO fire against the live deploy (pre-override):
///           - bonding must be enabled
///           - an attestation signer must be set (identity checked separately, §3)
///
///         Env:
///           SEPOLIA_RPC_URL  — Base Sepolia RPC (e.g. https://sepolia.base.org)
///
///         Run: forge test --match-contract ClaimForkRehearsal -vv
contract ClaimForkRehearsalTest is Test, HatchHelper {
    using stdJson for string;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher, bytes16 provider);
    event Reclaimed(
        uint256 indexed oldTokenId, uint256 indexed newTokenId, bytes32 indexed identityHash, address reclaimer
    );

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    string internal constant MANIFEST_PATH = "deployments/84532.json";
    string internal constant CLAIM_NAME = "ForkRehearsal";
    uint32 internal constant WRONG_SEED_XOR = 0x5eed;

    // -------------------------------------------------------------------------
    // Honest custodial: bond in place + render flip; never burns (C1 routing).
    // -------------------------------------------------------------------------

    function test_forkRehearsal_honestClaimFlipAgainstLiveDeploy() public {
        (BuddyNFT nft, address nftAddr, uint256 localSignerPk) = _setUpForkRehearsal();
        if (address(nft) == address(0)) return;

        string memory uuid = _freshUuid(nftAddr, "honest-claim");
        require(!nft.isMinted(_identityHash(uuid)), "rehearsal uuid already minted; rerun");

        uint256 tokenId = _hatchUuid(nft, uuid);
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Custodial), "hatched stage not Custodial");

        string memory preJson = SvgDecode.decodeJson(nft.tokenURI(tokenId));
        assertEq(preJson.readString(".attributes[5].value"), "Hatched", "pre-claim Stage must be Hatched");

        address recipient = makeAddr("fork-rehearsal-honest-recipient");
        BuddyNFT.ClaimAttestation memory attestation = _attestation(uuid, recipient, _prngSeed(uuid));
        bytes memory sig = _sign(nftAddr, localSignerPk, attestation);

        vm.prank(recipient);
        uint256 claimed = nft.claim(attestation, sig);
        assertEq(claimed, tokenId, "honest claim must keep the same tokenId (no burn)");

        assertEq(nft.ownerOf(tokenId), recipient, "token not transferred to recipient");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "stage not Bonded");

        string memory json = SvgDecode.decodeJson(nft.tokenURI(tokenId));
        assertEq(json.readString(".attributes[5].value"), "Bonded", "post-claim Stage must be Bonded");
        assertEq(
            json.readString(".name"),
            string.concat(CLAIM_NAME, unicode" · Buddy Onchain #", Strings.toString(tokenId)),
            "post-claim name must be the bonded display name"
        );

        string memory svg = SvgDecode.decodeSvg(json.readString(".image"));
        assertTrue(SvgDecode.contains(svg, unicode" │ BONDED</text>"), "title rail must flip to BONDED");
        assertTrue(SvgDecode.contains(svg, ", Bonded</title>"), "svg <title> must flip to Bonded");

        emit log_named_uint("rehearsed honest claim on fork, tokenId", tokenId);
    }

    // -------------------------------------------------------------------------
    // Wrong-seed custodial: burn + remint + bond (replacement carries attested seed).
    // -------------------------------------------------------------------------

    /// @dev Wrong-seed fixture bundled into a struct (single stack slot) — the flat
    ///      locals plus expectEmit calls blow the legacy-codegen stack otherwise.
    struct WrongSeedFixture {
        bytes32 identityHash;
        uint32 attestedSeed;
        uint256 squatTokenId;
        uint256 expectedNewTokenId;
        address recipient;
        BuddyNFT.ClaimAttestation attestation;
        bytes signature;
    }

    function test_forkRehearsal_wrongSeedClaimReplacesAgainstLiveDeploy() public {
        (BuddyNFT nft, address nftAddr, uint256 localSignerPk) = _setUpForkRehearsal();
        if (address(nft) == address(0)) return;

        WrongSeedFixture memory f = _wrongSeedFixture(nft, nftAddr, localSignerPk);

        vm.expectEmit(true, true, true, true, address(nft));
        emit Reclaimed(f.squatTokenId, f.expectedNewTokenId, f.identityHash, f.recipient);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(nft), address(0), f.squatTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(0), address(nft), f.expectedNewTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(f.expectedNewTokenId, f.identityHash, f.recipient, CLAUDE_PROVIDER);

        vm.prank(f.recipient);
        uint256 newTokenId = nft.claim(f.attestation, f.signature);

        assertEq(newTokenId, f.expectedNewTokenId, "replacement token id mismatch");
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, f.squatTokenId));
        nft.ownerOf(f.squatTokenId);
        assertEq(nft.ownerOf(newTokenId), f.recipient, "replacement not claimed to recipient");
        assertEq(uint8(nft.getStage(newTokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "replacement not Bonded");
        assertEq(nft.getTokenIdByIdentity(f.identityHash), newTokenId, "identity lookup not repointed");
        assertEq(nft.buddyPrngSeed(newTokenId), f.attestedSeed, "replacement must carry attested seed");

        emit log_named_uint("rehearsed wrong-seed claim on fork, old tokenId", f.squatTokenId);
        emit log_named_uint("rehearsed wrong-seed claim on fork, new tokenId", newTokenId);
    }

    function _wrongSeedFixture(BuddyNFT nft, address nftAddr, uint256 localSignerPk)
        internal
        returns (WrongSeedFixture memory f)
    {
        string memory uuid = _freshUuid(nftAddr, "wrong-seed-claim");
        f.identityHash = _identityHash(uuid);
        require(!nft.isMinted(f.identityHash), "rehearsal uuid already minted; rerun");

        f.attestedSeed = _prngSeed(uuid);
        uint32 storedSeed = f.attestedSeed ^ WRONG_SEED_XOR;
        assertTrue(storedSeed != f.attestedSeed, "squat precondition: stored seed must differ from attested");

        address squatter = makeAddr("fork-rehearsal-squatter");
        vm.prank(squatter);
        f.squatTokenId = nft.hatch(f.identityHash, storedSeed, CLAUDE_PROVIDER);
        assertEq(nft.buddyPrngSeed(f.squatTokenId), storedSeed, "squat stored seed mismatch");

        f.recipient = makeAddr("fork-rehearsal-wrongseed-recipient");
        f.expectedNewTokenId = f.squatTokenId + 1;
        f.attestation = _attestation(uuid, f.recipient, f.attestedSeed);
        f.signature = _sign(nftAddr, localSignerPk, f.attestation);
    }

    // -------------------------------------------------------------------------
    // Bonded: AlreadyBonded refusal (the replay nonce) on the live deploy.
    // -------------------------------------------------------------------------

    function test_forkRehearsal_bondedClaimRevertsAgainstLiveDeploy() public {
        (BuddyNFT nft, address nftAddr, uint256 localSignerPk) = _setUpForkRehearsal();
        if (address(nft) == address(0)) return;

        string memory uuid = _freshUuid(nftAddr, "bonded-claim");
        require(!nft.isMinted(_identityHash(uuid)), "rehearsal uuid already minted; rerun");

        address recipient = makeAddr("fork-rehearsal-bonded-recipient");
        BuddyNFT.ClaimAttestation memory attestation = _attestation(uuid, recipient, _prngSeed(uuid));
        bytes memory sig = _sign(nftAddr, localSignerPk, attestation);

        // No-token branch: first claim mints + bonds.
        vm.prank(recipient);
        uint256 tokenId = nft.claim(attestation, sig);
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "first claim must bond");

        // Replay against the now-bonded identity: AlreadyBonded.
        vm.expectRevert(BuddyNFT.AlreadyBonded.selector);
        vm.prank(recipient);
        nft.claim(attestation, sig);

        emit log_named_uint("bonded claim reverted AlreadyBonded on fork, tokenId", tokenId);
    }

    // -------------------------------------------------------------------------
    // Shared setup + signing
    // -------------------------------------------------------------------------

    function _setUpForkRehearsal() internal returns (BuddyNFT nft, address nftAddr, uint256 localSignerPk) {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0 || !vm.exists(MANIFEST_PATH)) {
            emit log("skip: set SEPOLIA_RPC_URL and deploy (deployments/84532.json) to rehearse claim against the live deploy");
            vm.skip(true);
            return (BuddyNFT(address(0)), address(0), 0);
        }

        vm.createSelectFork(rpc);
        assertEq(block.chainid, BASE_SEPOLIA_CHAIN_ID, "fork is not Base Sepolia (84532)");

        string memory manifest = vm.readFile(MANIFEST_PATH);
        if (!manifest.keyExists(".addresses.BuddyNFT")) {
            emit log("skip: deployments/84532.json missing .addresses.BuddyNFT");
            vm.skip(true);
            return (BuddyNFT(address(0)), address(0), 0);
        }

        // Deployed address from the manifest — repo source of truth, zero operator paste.
        nftAddr = manifest.readAddress(".addresses.BuddyNFT");
        if (nftAddr == address(0)) {
            emit log("skip: deployments/84532.json missing .addresses.BuddyNFT");
            vm.skip(true);
            return (BuddyNFT(address(0)), address(0), 0);
        }
        nft = BuddyNFT(nftAddr);

        // Live config snapshot — surfaces deploy/config state for the operator.
        address owner = nft.owner();
        emit log_named_address("live owner", owner);
        emit log_named_address("live attestationSigner", nft.attestationSigner());
        emit log_named_string("live bondingEnabled", nft.bondingEnabled() ? "true" : "false");
        emit log_named_address("live renderer", nft.renderer());

        // Config-drift gates the hermetic suite cannot see: claim is bond-phase
        // functionality, so the live deploy must be bond-ready before local override.
        assertTrue(nft.bondingEnabled(), "live deploy: bonding not enabled");
        assertTrue(nft.attestationSigner() != address(0), "live deploy: attestationSigner unset");

        // Repoint signer locally on the fork (owner prank, no key). The digest binds
        // chainId + verifyingContract + fields, so a local signer stays faithful.
        localSignerPk = uint256(keccak256("fork-claim-rehearsal-signer"));
        vm.prank(owner);
        nft.setAttestationSigner(vm.addr(localSignerPk));
    }

    function _attestation(string memory uuid, address recipient, uint32 prngSeed)
        internal
        view
        returns (BuddyNFT.ClaimAttestation memory)
    {
        return BuddyNFT.ClaimAttestation({
            identityHash: _identityHash(uuid),
            prngSeed: prngSeed,
            provider: CLAUDE_PROVIDER,
            name: CLAIM_NAME,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _sign(address nftAddr, uint256 localSignerPk, BuddyNFT.ClaimAttestation memory attestation)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(localSignerPk, ClaimAttestationHelper.digest(nftAddr, attestation));
        return abi.encodePacked(r, s, v);
    }

    /// @dev Valid RFC 4122 v4 UUID seeded from block + address + scenario entropy.
    ///      Deterministic WITHIN a fork block; reseeds at a later Sepolia block. The
    ///      isMinted() guard at each call site turns any collision into a loud revert.
    function _freshUuid(address salt, string memory label) internal view returns (string memory) {
        bytes16 rand = bytes16(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, salt, label)));
        bytes memory hexc = "0123456789abcdef";
        bytes memory out = new bytes(36);
        uint256 nib;
        for (uint256 i = 0; i < 36; ++i) {
            if (i == 8 || i == 13 || i == 18 || i == 23) {
                out[i] = "-";
                continue;
            }
            uint8 b = uint8(rand[nib / 2]);
            uint8 value = (nib % 2 == 0) ? (b >> 4) : (b & 0x0f);
            out[i] = hexc[value];
            ++nib;
        }
        out[14] = "4"; // version nibble
        out[19] = "8"; // variant nibble (one of 8/9/a/b)
        return string(out);
    }
}

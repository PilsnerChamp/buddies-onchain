// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {IBuddyNFT} from "../../contracts/interfaces/IBuddyNFT.sol";
import {HatchHelper} from "../helpers/HatchHelper.sol";
import {ReclaimAttestationHelper} from "../helpers/ReclaimAttestationHelper.sol";

/// @title BondReclaimForkRehearsal
/// @notice Dress rehearsal of the reclaim path against the ACTUALLY DEPLOYED
///         Base Sepolia BuddyNFT. Complements BondForkRehearsal, which covers the
///         honest BOND path only, by exercising Decision-10/11 reclaim cases 4 + 5:
///         a squatted custodial token (stored seed != attested seed) is burned and
///         re-hatched, while an honest custodial token (stored seed == attested seed)
///         is refused. Real reads hit deployed bytecode/config on forked chainId 84532;
///         all writes hit the local fork and are discarded.
/// @dev    Runnable with ONLY a fork URL — no private keys, no pasted address. The
///         deployed address loads from the `deployments/84532.json` manifest written
///         by deploy.sh (repo source of truth), and the signer is repointed locally
///         via an owner prank, so we sign with a local key. Skips cleanly (vm.skip)
///         when the RPC env or the manifest/address is absent, so `forge test` stays
///         green pre-deploy and in CI.
///
///         Env:
///           SEPOLIA_RPC_URL  — Base Sepolia RPC (e.g. https://sepolia.base.org)
///
///         Run: forge test --match-contract BondReclaimForkRehearsal -vv
contract BondReclaimForkRehearsalTest is Test, HatchHelper {
    using stdJson for string;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher, bytes16 provider);
    event Reclaimed(
        uint256 indexed oldTokenId, uint256 indexed newTokenId, bytes32 indexed identityHash, address reclaimer
    );

    struct ReclaimFixture {
        bytes32 identityHash;
        uint32 attestedSeed;
        uint256 oldTokenId;
        address reclaimer;
        BuddyNFT.ReclaimAttestation attestation;
        bytes signature;
        uint256 expectedNewTokenId;
    }

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    string internal constant MANIFEST_PATH = "deployments/84532.json";
    uint32 internal constant WRONG_SEED_XOR = 0x5eed;

    function testSquatReclaimSucceeds() public {
        (BuddyNFT nft, address nftAddr, uint256 localSignerPk) = _setUpForkReclaimRehearsal();
        if (address(nft) == address(0)) return;

        ReclaimFixture memory fixture = _squatReclaimFixture(nft, nftAddr, localSignerPk);
        _expectReclaimEvents(nft, fixture);

        vm.prank(fixture.reclaimer);
        uint256 newTokenId = nft.reclaimAndHatch(fixture.attestation, fixture.signature);
        _assertSuccessfulReclaim(nft, fixture, newTokenId);

        emit log_named_uint("rehearsed reclaim on fork, old tokenId", fixture.oldTokenId);
        emit log_named_uint("rehearsed reclaim on fork, new tokenId", newTokenId);
    }

    function testHonestTokenReclaimReverts() public {
        (BuddyNFT nft, address nftAddr, uint256 localSignerPk) = _setUpForkReclaimRehearsal();
        if (address(nft) == address(0)) return;

        ReclaimFixture memory fixture = _honestReclaimFixture(nft, nftAddr, localSignerPk);

        vm.expectRevert(BuddyNFT.InvalidAttestation.selector);
        vm.prank(fixture.reclaimer);
        nft.reclaimAndHatch(fixture.attestation, fixture.signature);

        assertEq(nft.ownerOf(fixture.oldTokenId), address(nft), "honest token should still exist in custody");
        assertEq(nft.getTokenIdByIdentity(fixture.identityHash), fixture.oldTokenId, "honest identity lookup changed");
        assertEq(nft.buddyPrngSeed(fixture.oldTokenId), fixture.attestedSeed, "honest token seed changed");
        assertEq(
            uint8(nft.getStage(fixture.oldTokenId)),
            uint8(IBuddyNFT.OwnershipStage.Custodial),
            "honest token stage changed"
        );

        emit log_named_uint("honest reclaim reverted InvalidAttestation on fork, tokenId", fixture.oldTokenId);
    }

    function _squatReclaimFixture(BuddyNFT nft, address nftAddr, uint256 localSignerPk)
        internal
        returns (ReclaimFixture memory fixture)
    {
        fixture.identityHash = _freshIdentityHash(nftAddr, "squat-reclaim-succeeds");
        require(!nft.isMinted(fixture.identityHash), "reclaim squat identity already minted; rerun");

        fixture.attestedSeed = _attestedSeed(fixture.identityHash);
        uint32 storedSeed = fixture.attestedSeed ^ WRONG_SEED_XOR;
        assertTrue(storedSeed != fixture.attestedSeed, "squat precondition: stored seed must differ from attested seed");

        address squatter = makeAddr("fork-reclaim-squatter");
        vm.prank(squatter);
        fixture.oldTokenId = nft.hatch(fixture.identityHash, storedSeed, CLAUDE_PROVIDER);
        assertEq(nft.buddyPrngSeed(fixture.oldTokenId), storedSeed, "squat stored seed mismatch");
        assertEq(
            uint8(nft.getStage(fixture.oldTokenId)),
            uint8(IBuddyNFT.OwnershipStage.Custodial),
            "squat must be Custodial"
        );

        fixture.reclaimer = makeAddr("fork-reclaim-reclaimer");
        fixture.attestation = BuddyNFT.ReclaimAttestation({
            tokenId: fixture.oldTokenId,
            identityHash: fixture.identityHash,
            prngSeed: fixture.attestedSeed,
            provider: CLAUDE_PROVIDER,
            reclaimer: fixture.reclaimer,
            expiry: uint64(block.timestamp + 1 hours)
        });
        fixture.signature = _signReclaimAttestation(nftAddr, localSignerPk, fixture.attestation);
        fixture.expectedNewTokenId = fixture.oldTokenId + 1;
    }

    function _honestReclaimFixture(BuddyNFT nft, address nftAddr, uint256 localSignerPk)
        internal
        returns (ReclaimFixture memory fixture)
    {
        fixture.identityHash = _freshIdentityHash(nftAddr, "honest-reclaim-reverts");
        require(!nft.isMinted(fixture.identityHash), "reclaim honest identity already minted; rerun");

        fixture.attestedSeed = _attestedSeed(fixture.identityHash);
        address hatcher = makeAddr("fork-reclaim-honest-hatcher");
        vm.prank(hatcher);
        fixture.oldTokenId = nft.hatch(fixture.identityHash, fixture.attestedSeed, CLAUDE_PROVIDER);
        assertEq(
            nft.buddyPrngSeed(fixture.oldTokenId),
            fixture.attestedSeed,
            "honest precondition: stored seed must equal attested seed"
        );
        assertEq(
            uint8(nft.getStage(fixture.oldTokenId)),
            uint8(IBuddyNFT.OwnershipStage.Custodial),
            "honest token must start Custodial"
        );

        fixture.reclaimer = makeAddr("fork-reclaim-honest-reclaimer");
        fixture.attestation = BuddyNFT.ReclaimAttestation({
            tokenId: fixture.oldTokenId,
            identityHash: fixture.identityHash,
            prngSeed: fixture.attestedSeed,
            provider: CLAUDE_PROVIDER,
            reclaimer: fixture.reclaimer,
            expiry: uint64(block.timestamp + 1 hours)
        });
        fixture.signature = _signReclaimAttestation(nftAddr, localSignerPk, fixture.attestation);
    }

    function _expectReclaimEvents(BuddyNFT nft, ReclaimFixture memory fixture) internal {
        vm.expectEmit(true, true, true, true, address(nft));
        emit Reclaimed(fixture.oldTokenId, fixture.expectedNewTokenId, fixture.identityHash, fixture.reclaimer);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(nft), address(0), fixture.oldTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Transfer(address(0), address(nft), fixture.expectedNewTokenId);
        vm.expectEmit(true, true, true, true, address(nft));
        emit Awakened(fixture.expectedNewTokenId, fixture.identityHash, fixture.reclaimer, CLAUDE_PROVIDER);
    }

    function _assertSuccessfulReclaim(BuddyNFT nft, ReclaimFixture memory fixture, uint256 newTokenId) internal {
        assertEq(newTokenId, fixture.expectedNewTokenId, "replacement token id mismatch");
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, fixture.oldTokenId));
        nft.ownerOf(fixture.oldTokenId);
        assertEq(nft.ownerOf(newTokenId), address(nft), "replacement not contract-custodied");
        assertEq(nft.getTokenIdByIdentity(fixture.identityHash), newTokenId, "identity lookup not repointed");
        assertEq(nft.buddyPrngSeed(newTokenId), fixture.attestedSeed, "replacement must carry attested seed");
        assertEq(
            uint8(nft.getStage(newTokenId)),
            uint8(IBuddyNFT.OwnershipStage.Custodial),
            "replacement stage not Custodial"
        );
    }

    function _setUpForkReclaimRehearsal() internal returns (BuddyNFT nft, address nftAddr, uint256 localSignerPk) {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0 || !vm.exists(MANIFEST_PATH)) {
            emit log("skip: set SEPOLIA_RPC_URL and deploy (deployments/84532.json) to rehearse reclaim against the live deploy");
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

        // Config-drift gates the hermetic suite cannot see: reclaim is bond-phase
        // functionality, so the live deploy must be bond-ready before local override.
        assertTrue(nft.bondingEnabled(), "live deploy: bonding not enabled");
        assertTrue(nft.attestationSigner() != address(0), "live deploy: attestationSigner unset");

        // Repoint signer locally on the fork (owner prank, no key). The digest binds
        // chainId + verifyingContract + fields, so a local signer stays faithful.
        localSignerPk = uint256(keccak256("fork-reclaim-rehearsal-signer"));
        vm.prank(owner);
        nft.setAttestationSigner(vm.addr(localSignerPk));
    }

    function _signReclaimAttestation(
        address nftAddr,
        uint256 localSignerPk,
        BuddyNFT.ReclaimAttestation memory attestation
    ) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(localSignerPk, ReclaimAttestationHelper.digest(nftAddr, attestation));
        return abi.encodePacked(r, s, v);
    }

    /// @dev Fresh identity hash seeded from block + address + scenario entropy. The
    ///      isMinted() guard at each call site turns any collision into a loud revert.
    function _freshIdentityHash(address salt, string memory label) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("fork-reclaim-rehearsal", label, block.timestamp, block.prevrandao, salt));
    }

    /// @dev Models the signer-spec invariant for the fork fixture: attestedSeed is
    ///      produced from identity data, never echoed from chain storage.
    function _attestedSeed(bytes32 identityHash) internal pure returns (uint32) {
        return uint32(uint256(keccak256(abi.encodePacked("fork-reclaim-attested-seed", identityHash))));
    }
}

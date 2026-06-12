// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {ReclaimAttestationHelper} from "../test/helpers/ReclaimAttestationHelper.sol";

/// @title ReclaimSepolia
/// @notice Live-fire rehearsal: sign a throwaway-key ReclaimAttestation and broadcast
///         reclaimAndHatch() so the squat-burn + replacement-mint path runs once against
///         a real Base Sepolia deploy before mainnet. Companion to BondSepolia — same
///         two-key shape, same simulated-preflight caveats.
/// @dev    Two keys: SIGNER_KEY signs the attestation only; RECLAIMER_KEY broadcasts
///         reclaimAndHatch() because the contract enforces `attestation.reclaimer ==
///         msg.sender`. Assumes the SQUAT is already hatched (a token holding the target
///         identity hash with a seed that does NOT derive from the account UUID).
///
///         Signer-spec invariant: ATTESTED_SEED is the seed DERIVED FROM THE ACCOUNT
///         UUID off-chain. It is never read from chain state — the buddyPrngSeed()
///         preflight below is fail-fast UX only and asserts the INVERSE predicate
///         (stored != attested), matching the contract's honest-token refusal.
///
///         The post-broadcast require()s run against SIMULATED state and are a fast
///         preflight only. The authoritative confirmation is a separate post-mine
///         read — this script prints the exact `cast call` commands to run.
///
///         Env:
///           SIGNER_KEY     — throwaway attestation signer private key (rig A)
///           RECLAIMER_KEY  — reclaiming wallet private key (must hold Sepolia ETH)
///           BUDDY_NFT      — deployed BuddyNFT address
///           TOKEN_ID       — squatted tokenId to reclaim
///           ATTESTED_SEED  — uint32 prngSeed derived from the account UUID off-chain
///           PROVIDER       — optional provider label for the replacement mint
///                            (lowercase [a-z0-9-], max 16 chars; defaults to "claude")
///           EXPIRY         — optional unix expiry; defaults to now + 1 day
///
///         Run:
///           forge script script/ReclaimSepolia.s.sol:ReclaimSepolia \
///             --rpc-url https://sepolia.base.org --broadcast
contract ReclaimSepolia is Script {
    function run() external {
        uint256 signerPk = vm.envUint("SIGNER_KEY");
        uint256 reclaimerPk = vm.envUint("RECLAIMER_KEY");
        address nftAddr = vm.envAddress("BUDDY_NFT");
        uint256 tokenId = vm.envUint("TOKEN_ID");
        uint32 attestedSeed = uint32(vm.envUint("ATTESTED_SEED"));
        bytes16 provider = _providerLabel(vm.envOr("PROVIDER", string("claude")));
        uint64 expiry = uint64(vm.envOr("EXPIRY", block.timestamp + 1 days));

        BuddyNFT nft = BuddyNFT(nftAddr);
        address reclaimer = vm.addr(reclaimerPk);

        // Preflight (reads against live state; fail loud before spending the reclaim tx).
        require(nft.bondingEnabled(), "bonding not enabled on deploy");
        require(nft.attestationSigner() == vm.addr(signerPk), "deploy attestationSigner != SIGNER_KEY address");
        bytes32 identityHash = nft.buddyIdentityHash(tokenId);
        require(identityHash != bytes32(0), "tokenId not hatched");
        require(nft.getStage(tokenId) == IBuddyNFT.OwnershipStage.Custodial, "token not custodial (bonded?)");
        // Fail-fast UX only — the attested value stays the UUID-derived env input. The
        // contract refuses honest tokens (stored == attested) with InvalidAttestation.
        require(nft.buddyPrngSeed(tokenId) != attestedSeed, "stored seed == ATTESTED_SEED (honest token, not a squat)");
        require(expiry > block.timestamp, "expiry in the past");

        BuddyNFT.ReclaimAttestation memory attestation = BuddyNFT.ReclaimAttestation({
            tokenId: tokenId,
            identityHash: identityHash,
            prngSeed: attestedSeed,
            provider: provider,
            reclaimer: reclaimer,
            expiry: expiry
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ReclaimAttestationHelper.digest(nftAddr, attestation));

        vm.startBroadcast(reclaimerPk);
        uint256 newTokenId = nft.reclaimAndHatch(attestation, abi.encodePacked(r, s, v));
        vm.stopBroadcast();

        // Simulated-state preflight only — NOT the authoritative confirmation.
        require(nft.getTokenIdByIdentity(identityHash) == newTokenId, "simulated lookup not repointed");
        require(nft.ownerOf(newTokenId) == nftAddr, "simulated replacement not custodial");
        require(nft.buddyPrngSeed(newTokenId) == attestedSeed, "simulated replacement seed mismatch");
        try nft.ownerOf(tokenId) {
            revert("simulated squat still exists post-reclaim");
        } catch {}

        console.log("Broadcast reclaimAndHatch() submitted.");
        console.log("  squat tokenId      :", tokenId);
        console.log("  replacement tokenId:", newTokenId);
        console.log("  reclaimer          :", reclaimer);
        console.log("Authoritative post-mine checks (run after confirmation):");
        console.log(
            "  cast call <NFT> 'getTokenIdByIdentity(bytes32)(uint256)' <HASH> --rpc-url <RPC>  # expect new id"
        );
        console.log("  cast call <NFT> 'ownerOf(uint256)(address)' <NEW_TID> --rpc-url <RPC>            # expect <NFT>");
        console.log(
            "  cast call <NFT> 'ownerOf(uint256)(address)' <OLD_TID> --rpc-url <RPC>            # expect revert"
        );
        console.log("  cast call <NFT> 'buddyPrngSeed(uint256)(uint32)' <NEW_TID> --rpc-url <RPC>       # expect seed");
    }

    /// @dev Mirrors the contract's bytes16 provider shape: ascii label, null-padded
    ///      tail. Charset validity is enforced on-chain at hatch and self-declared
    ///      at reclaim; the length gate here just fails fast on operator typos.
    function _providerLabel(string memory label) internal pure returns (bytes16) {
        bytes memory raw = bytes(label);
        require(raw.length > 0 && raw.length <= 16, "PROVIDER must be 1-16 chars");
        // forge-lint: disable-next-line(unsafe-typecast)
        return bytes16(raw);
    }
}

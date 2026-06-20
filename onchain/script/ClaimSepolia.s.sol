// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {ClaimAttestationHelper} from "../test/helpers/ClaimAttestationHelper.sol";

/// @title ClaimSepolia
/// @notice Live-fire: sign a throwaway-key ClaimAttestation and broadcast the single
///         `claim()` door so a real bonded token exists on Base Sepolia for the
///         external-rasterizer eyeball gates (OpenSea testnet / Etherscan / Rainbow).
///         One door now: claim() resolves the identity's state and routes itself —
///         this script exercises whichever branch the live token state implies (no
///         token -> mint+bond; honest custodial -> bond; wrong seed -> replace+bond).
///         This is the only layer that mutates real chain state; the EIP-712 sign step
///         is the gap no `cast` invocation fills.
/// @dev    Two keys: SIGNER_KEY signs the attestation only; RECIPIENT_KEY broadcasts
///         claim() because the contract enforces `attestation.recipient == msg.sender`.
///
///         ATTESTED_SEED is the seed DERIVED FROM THE ACCOUNT UUID off-chain
///         (signer-spec invariant: never echo chain state). On an already-hatched
///         token, a matching seed bonds it in place; a non-matching seed burns the
///         wrong-seed token and remints with the attested seed, then bonds.
///
///         The post-broadcast require()s run against SIMULATED state and are a fast
///         preflight only. The authoritative confirmation is a separate post-mine
///         read — this script prints the exact `cast call` commands to run.
///
///         Env:
///           SIGNER_KEY     — throwaway attestation signer private key (rig A)
///           RECIPIENT_KEY  — claiming wallet private key (must hold Sepolia ETH)
///           BUDDY_NFT      — deployed BuddyNFT address
///           IDENTITY_HASH  — bytes32 identity hash to claim
///           ATTESTED_SEED  — uint32 prngSeed DERIVED FROM THE ACCOUNT UUID off-chain
///           PROVIDER       — optional provider label (lowercase [a-z0-9-], max 16
///                            chars; defaults to "claude")
///           BUDDY_NAME     — optional display name to set at claim (<=14 bytes; "" ok)
///           EXPIRY         — optional unix expiry; defaults to now + 1 day
///
///         Run:
///           forge script script/ClaimSepolia.s.sol:ClaimSepolia \
///             --rpc-url https://sepolia.base.org --broadcast
contract ClaimSepolia is Script {
    function run() external {
        uint256 signerPk = vm.envUint("SIGNER_KEY");
        uint256 recipientPk = vm.envUint("RECIPIENT_KEY");
        address nftAddr = vm.envAddress("BUDDY_NFT");
        bytes32 identityHash = vm.envBytes32("IDENTITY_HASH");
        uint32 attestedSeed = uint32(vm.envUint("ATTESTED_SEED"));
        bytes16 provider = _providerLabel(vm.envOr("PROVIDER", string("claude")));
        string memory name = vm.envOr("BUDDY_NAME", string(""));
        uint64 expiry = uint64(vm.envOr("EXPIRY", block.timestamp + 1 days));

        BuddyNFT nft = BuddyNFT(nftAddr);
        address recipient = vm.addr(recipientPk);

        // Preflight (reads against live state; fail loud before spending the claim tx).
        require(nft.bondingEnabled(), "bonding not enabled on deploy");
        require(nft.attestationSigner() == vm.addr(signerPk), "deploy attestationSigner != SIGNER_KEY address");
        require(identityHash != bytes32(0), "IDENTITY_HASH is zero");
        require(expiry > block.timestamp, "expiry in the past");

        // Surface the branch claim() will route into (UX only — the contract owns
        // the actual decision from live storage).
        if (!nft.isMinted(identityHash)) {
            console.log("branch preview: no token -> mint + bond");
        } else {
            uint256 existing = nft.getTokenIdByIdentity(identityHash);
            require(
                nft.getStage(existing) == IBuddyNFT.OwnershipStage.Custodial, "identity already bonded (AlreadyBonded)"
            );
            if (nft.buddyPrngSeed(existing) == attestedSeed) {
                console.log("branch preview: honest custodial -> bond in place");
            } else {
                console.log("branch preview: wrong seed -> replace + bond");
            }
        }

        BuddyNFT.ClaimAttestation memory attestation = BuddyNFT.ClaimAttestation({
            identityHash: identityHash,
            prngSeed: attestedSeed,
            provider: provider,
            name: name,
            recipient: recipient,
            expiry: expiry
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ClaimAttestationHelper.digest(nftAddr, attestation));

        vm.startBroadcast(recipientPk);
        uint256 tokenId = nft.claim(attestation, abi.encodePacked(r, s, v));
        vm.stopBroadcast();

        // Simulated-state preflight only — NOT the authoritative confirmation.
        require(nft.ownerOf(tokenId) == recipient, "simulated post-claim owner mismatch");
        require(nft.getStage(tokenId) == IBuddyNFT.OwnershipStage.Bonded, "simulated post-claim stage not Bonded");
        require(nft.getTokenIdByIdentity(identityHash) == tokenId, "simulated lookup not pointed at claimed token");
        require(nft.buddyPrngSeed(tokenId) == attestedSeed, "simulated claimed seed mismatch");

        console.log("Broadcast claim() submitted.");
        console.log("  identityHash claimed to tokenId:", tokenId);
        console.log("  recipient:", recipient);
        console.log("Authoritative post-mine checks (run after confirmation):");
        console.log("  cast call <NFT> 'getStage(uint256)(uint8)' <TID> --rpc-url <RPC>   # expect 1 (Bonded)");
        console.log("  cast call <NFT> 'ownerOf(uint256)(address)' <TID> --rpc-url <RPC>  # expect recipient");
        console.log("  cast call <NFT> 'getTokenIdByIdentity(bytes32)(uint256)' <HASH> --rpc-url <RPC>  # expect <TID>");
        console.log(
            "  cast call <NFT> 'tokenURI(uint256)(string)' <TID> --rpc-url <RPC> | sed 's/.*base64,//' | base64 -d"
        );
    }

    /// @dev Mirrors the contract's bytes16 provider shape: ascii label, null-padded
    ///      tail. Charset validity is enforced on-chain at claim; the length gate here
    ///      just fails fast on operator typos.
    function _providerLabel(string memory label) internal pure returns (bytes16) {
        bytes memory raw = bytes(label);
        require(raw.length > 0 && raw.length <= 16, "PROVIDER must be 1-16 chars");
        // forge-lint: disable-next-line(unsafe-typecast)
        return bytes16(raw);
    }
}

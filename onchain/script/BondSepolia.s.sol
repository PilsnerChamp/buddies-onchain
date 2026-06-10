// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {BondAttestationHelper} from "../test/helpers/BondAttestationHelper.sol";

/// @title BondSepolia
/// @notice Live-fire: sign a throwaway-key BondAttestation and broadcast bond() so a
///         real bonded token exists on Base Sepolia for the external-rasterizer
///         eyeball gates (OpenSea testnet / Etherscan / Rainbow). This is the only
///         layer that mutates real chain state — the EIP-712 sign step is the gap no
///         `cast` invocation fills.
/// @dev    Two keys: SIGNER_KEY signs the attestation only; RECIPIENT_KEY broadcasts
///         bond() because the contract enforces `attestation.recipient == msg.sender`.
///         Assumes the token is already hatched (hatch via `cast send hatch(bytes32,uint32,bytes16)`).
///
///         The post-broadcast require()s here run against SIMULATED state and are a
///         fast preflight only. The authoritative confirmation is a separate post-mine
///         read — this script prints the exact `cast call` commands to run.
///
///         Env:
///           SIGNER_KEY     — throwaway attestation signer private key (rig A)
///           RECIPIENT_KEY  — bonding wallet private key (must hold Sepolia ETH)
///           BUDDY_NFT      — deployed BuddyNFT address
///           TOKEN_ID       — hatched tokenId to bond
///           BUDDY_NAME     — display name to set at bond
///           EXPIRY         — optional unix expiry; defaults to now + 1 day
///
///         Run:
///           forge script script/BondSepolia.s.sol:BondSepolia \
///             --rpc-url https://sepolia.base.org --broadcast
contract BondSepolia is Script {
    function run() external {
        uint256 signerPk = vm.envUint("SIGNER_KEY");
        uint256 recipientPk = vm.envUint("RECIPIENT_KEY");
        address nftAddr = vm.envAddress("BUDDY_NFT");
        uint256 tokenId = vm.envUint("TOKEN_ID");
        string memory name = vm.envString("BUDDY_NAME");
        uint64 expiry = uint64(vm.envOr("EXPIRY", block.timestamp + 1 days));

        BuddyNFT nft = BuddyNFT(nftAddr);
        address recipient = vm.addr(recipientPk);

        // Preflight (reads against live state; fail loud before spending the bond tx).
        require(nft.bondingEnabled(), "bonding not enabled on deploy");
        require(nft.attestationSigner() == vm.addr(signerPk), "deploy attestationSigner != SIGNER_KEY address");
        bytes32 identityHash = nft.buddyIdentityHash(tokenId);
        require(identityHash != bytes32(0), "tokenId not hatched");
        require(nft.ownerOf(tokenId) == nftAddr, "token not in custody (already bonded?)");
        require(expiry > block.timestamp, "expiry in the past");

        BuddyNFT.BondAttestation memory attestation = BuddyNFT.BondAttestation({
            tokenId: tokenId, identityHash: identityHash, recipient: recipient, expiry: expiry
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, BondAttestationHelper.digest(nftAddr, attestation));

        vm.startBroadcast(recipientPk);
        nft.bond(tokenId, name, attestation, abi.encodePacked(r, s, v));
        vm.stopBroadcast();

        // Simulated-state preflight only — NOT the authoritative confirmation.
        require(nft.ownerOf(tokenId) == recipient, "simulated post-bond owner mismatch");
        require(nft.getStage(tokenId) == IBuddyNFT.OwnershipStage.Bonded, "simulated post-bond stage not Bonded");

        console.log("Broadcast bond() submitted.");
        console.log("  tokenId :", tokenId);
        console.log("  recipient:", recipient);
        console.log("Authoritative post-mine checks (run after confirmation):");
        console.log("  cast call <NFT> 'getStage(uint256)(uint8)' <TID> --rpc-url <RPC>   # expect 1");
        console.log("  cast call <NFT> 'ownerOf(uint256)(address)' <TID> --rpc-url <RPC>  # expect recipient");
        console.log(
            "  cast call <NFT> 'tokenURI(uint256)(string)' <TID> --rpc-url <RPC> | sed 's/.*base64,//' | base64 -d"
        );
    }
}

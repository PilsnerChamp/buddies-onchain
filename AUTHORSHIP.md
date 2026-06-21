# Authorship Attestation

This file binds the Buddies Onchain author-attestation address to the project
author. The `BuddyNFT` contract commits to this address in bytecode and exposes
it via `AUTHOR_ATTESTATION_SIGNER()`. The signature below proves that the holder
of that address authored the project.

- **Attestation address:** `0x8e74D78a7AEa7542A23EdBE341bdc986ECcC6E0b`
- **Author:** PilsnerChamp — https://github.com/PilsnerChamp
- **Contract:** `BuddyNFT`, intended for Base mainnet (chain ID `8453`)

The attestation address is a dedicated cold key used only to sign authorship
statements. It is not a deployer, admin, treasury, minting, or operational
wallet. Its private key never touches this repository.

## Signed statement

The following exact text is signed by the attestation address. Verification
recovers the signer from this message and the signature below; the message must
match byte-for-byte, including line breaks.

```
I, PilsnerChamp (https://github.com/PilsnerChamp), am the author of Buddies Onchain and the BuddyNFT contract.

The Ethereum address below is my Buddies Onchain author-attestation address:

0x8e74D78a7AEa7542A23EdBE341bdc986ECcC6E0b

This address is not a deployer wallet, admin wallet, treasury, minting wallet, or operational wallet. It is only used to sign authorship attestations for the BuddyNFT contract.

The BuddyNFT mainnet deployment is intended for Base mainnet, chain ID 8453.

Date: 2026-06-21
```

## Signature

EIP-191 (`personal_sign`) signature produced by the attestation address over the
exact statement above:

```
0xdb66a41d8d1d6204ed6a1b41bb93313332d6b6c02aab8da6133e9d3bf5136e525d0c6a2dcac5a995b1d0b5af641d133cb40646784266f8c41eb8136bbe92d90f1c
```

## How to verify

1. Copy the **Signed statement** text exactly as shown (no surrounding fences).
   The signed message ends at `Date: 2026-06-21` with **no trailing newline**.
2. Recover the signer from that text plus the signature — any EIP-191
   `personal_sign` verifier works (e.g. Etherscan's signature tool, ethers
   `verifyMessage`, viem `recoverMessageAddress`).
3. Confirm the recovered address equals `0x8e74D78a7AEa7542A23EdBE341bdc986ECcC6E0b`.
4. Read `AUTHOR_ATTESTATION_SIGNER()` from the deployed `BuddyNFT` contract and
   confirm it returns the same address.

A match proves the same key committed in the contract signed this statement, and
that the GitHub account `PilsnerChamp` — which controls this repository —
published it.

## Challenge response

If authorship is later challenged, the author signs a fresh message with the
attestation address that includes the deployed contract address and a
challenger-supplied nonce, then publishes the message and signature here and
through the same public channels.

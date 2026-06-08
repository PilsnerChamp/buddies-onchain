# Security

Your buddy lives on-chain. No one — not Anthropic, not a future maintainer, not the project — can move it, take it, or rewrite the record: the token, its binding to your account's identity hash, and its deterministic traits are fixed once hatched. The rendered art is drawn from that record on-chain and can be re-skinned by the maintainer (`setRenderer`); the identity it draws stays yours. The rules below are how the contract holds that line.

## Soulbound posture

The contract holds every buddy. Tokens cannot leave the contract address except through one specific path — the `bond()` move that hands a buddy to its holder exactly once. There is no transfer, no approval, no burn:

- Standard ERC-721 transfer-approval calls (`approve`, `setApprovalForAll`) revert with `Soulbound()`. No wallet — including the holder — can grant permission to move a buddy.
- The internal transfer hook (`_update()`) only allows two state changes: the initial mint, and the one-way bond move out of the contract while the buddy is in `Custodial` stage. Every other state change reverts.
- Once bonded, the buddy sits in the recipient wallet permanently. No unbond, no re-bond, no rollback.

Trade-offs for users:

- No secondary-market exit. The identity record is permanent and non-transferable.
- No "burn to remove." The on-chain record persists.
- No host takedown. The contract holds the token; the renderer is bytecode.

## Maintainer powers

*Maintainer = the OZ `Ownable` `owner()` role on the contract.*

The maintainer can:

- Point the contract at a different renderer (changes how the SVG art is drawn from on-chain data) — `setRenderer(address)`.
- Rotate the signer key that authorizes bond attestations — `setAttestationSigner(address)`.
- Turn bonding on, once and permanently — `enableBonding()`. Requires a signer already set. Cannot be undone.
- Hand off the maintainer role to a new address, or drop it entirely — OZ `Ownable.transferOwnership` / `renounceOwnership`. Renouncing reverts while bonding is still disabled (prevents leaving the contract orphaned before users can claim their buddies).

The maintainer cannot:

- Move a minted buddy. The soulbound `_update()` gate blocks every maintainer-initiated transfer.
- Mint a buddy onto a specific wallet. `hatch()` is permissionless — anyone can hatch any valid UUID and pay gas. The minted buddy is held by the contract address regardless of who called; `_hatcher[tokenId]` records the calling wallet (`msg.sender`) for transparency only and grants no claim to the buddy. Recipient assignment happens later, at `bond()`, via signed attestation.
- Turn bonding off after enabling it. Activation is one-way.
- Set the signer to a zero address once bonding is live (would break all future attestation checks).

The `bond()` function is dormant in v1. It ships fully written and tested but reverts `BondingNotEnabled` until the maintainer flips the switch with `enableBonding()`. Until then, every buddy stays inside the contract.

## Reporting

For sensitive issues (unpatched vulnerabilities, key compromise, signature/attestation flaws):

- Report privately via GitHub Security Advisories — <https://github.com/PilsnerChamp/buddies-onchain/security/advisories/new>.
- Or direct message [@PilsnerChamp](https://x.com/PilsnerChamp) on X to coordinate disclosure.

For non-sensitive bugs, hardening notes, and general issues: open a GitHub issue at <https://github.com/PilsnerChamp/buddies-onchain/issues>.

Out of scope:

- No bug bounty. Solo project, no budget.
- No formal audit yet. The contract has not been third-party audited as of this public release. Reviewers welcome.

## Known limitations

- **Deterministic traits, not random.** The contract stores a caller-supplied seed (the plugin computes it from your account UUID client-side) and derives traits from it via Mulberry32. The chain proves consistency only: stored traits match the stored seed, and anyone can recompute `traits == _deriveTraits(seed)`. It does not prove the seed came from your account — that link is established off-chain. Anyone who knows your UUID can precompute the same seed and traits before you hatch. By design for reproducible hatching, not a secrecy or randomness guarantee.

- **Seed collisions produce identical twins.** The trait seed is 32-bit, so two different UUIDs that collide on it get the same traits and the same art. The backdrop derives from the seed (`keccak256(seed)`, Decision 6), not from the 256-bit identity hash, so nothing distinguishes the two tokens visually. Harmless at expected scale. Any fix must add identity-independent backdrop entropy, not re-couple the backdrop to the identity hash — that coupling was removed deliberately to keep art reproducible from the public seed.

- **The raw UUID never goes on-chain, but a held UUID is still an oracle.** Hatch takes a `bytes32` identity hash, not the UUID, so scraping calldata or logs yields hashes only — bulk-harvesting UUIDs from the chain is closed. The targeted case stays open: lookup (`getTokenIdByIdentity`) is public by necessity, so anyone who already holds a specific UUID can hash it, find that buddy, and read which wallet paid to hatch it. Inherent to any "look up your own buddy by UUID" product; accepted, not promised away.

- **The hatcher record is attribution only.** `hatch()` is permissionless and the identity hash is visible before a tx confirms, so a front-runner can hatch a hash they saw and become the recorded `hatcher`. That is all they get. The hatcher is who paid gas, recorded for transparency only — no ownership, no status, no priority, and it feeds no airdrop, ranking, or "founding hatcher" badge. The token mints to the contract regardless of caller, and rightful ownership is recovered at bonding because the attestation signs the stored hash. Front-running poisons attribution and nothing more — harmless because the hatcher is valueless.

- **A squatter can hatch your identity hash with their own seed.** `hatch()` is permissionless and the identity hash is visible before a tx confirms, so anyone who knows a victim's identity hash can hatch it first. Because traits derive from a caller-supplied seed, the squatter can pick or grind any body and traits — body-choice that did not exist when the contract derived the body from identity. The squatted token is contract-held, owned by no one, and unbondable: bonding (dormant) re-checks both the identity hash and the seed against a signed attestation, and a foreign seed fails. A dead record, not a hijack — the squatter cannot take, sell, or bond it. Bonding is dormant in v1, so the Stage-2 supersede/reclaim path does not exist on this deployment. A squatted identity hash is unrecoverable here: the token is stuck, with no reclaim. Two protections hold the line: the identity hash is secret-ish before mint (a squatter must already know the victim's hash), and the buddy is valueless. Permissionless mint-once always allowed squat-denial; the caller-supplied seed only adds cosmetic body-choice, which confers nothing because the token has no value.

- **Client UUID checks are advisory, not an on-chain guarantee.** The plugin and dApp validate that a UUID is well-formed before hashing it, but the contract accepts any non-zero `bytes32` and never sees a UUID. Client-side validation stops you from hashing junk; it is not a chain-enforced authenticity check.
- **Identity-matching brittleness.** Once bonding activates, the attestation signer bridges off-chain identity verification to on-chain bonding. A leaked signer key or compromised off-chain oracle could let a wrong wallet bond a token. Mitigation: signer rotation and attestation expiry.
- **Smart-wallet recipients.** `bond()` uses `_transfer` (no `onERC721Received` callback). Bonding to a contract wallet that cannot surface ERC-721 tokens effectively bricks the buddy. The dApp warns on contract-wallet recipients; the contract itself does not gate on recipient type.
- **Public-RPC rate limits.** The default `https://mainnet.base.org` and `https://sepolia.base.org` endpoints rate-limit aggressively. Swap RPC URL in `shared/networks.ts` if you hit limits.

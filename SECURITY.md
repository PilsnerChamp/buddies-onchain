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

- **Deterministic traits, not random.** Traits are derived from your account UUID through the identity hash via wyhash → Mulberry32. Anyone who knows your UUID can precompute your buddy's traits before you hatch. This is by design for reproducible hatching; it is not a secrecy or randomness guarantee.

- **The raw UUID never goes on-chain, but a held UUID is still an oracle.** Hatch takes a `bytes32` identity hash, not the UUID — so scraping calldata or logs yields hashes only, and bulk-harvesting UUIDs from the chain is closed. What stays open is targeted: the buddy lookup (`getTokenIdByIdentity`) is public by necessity, so anyone who *already holds* a specific UUID can hash it, find that buddy, and read which wallet paid to hatch it. This is inherent to any "look up your own buddy by UUID" product and is accepted, not promised away.

- **The hatcher record is attribution only.** `hatch()` is permissionless and the identity hash is visible before a transaction confirms, so a front-runner can hatch a hash they saw and become the recorded `hatcher`. That is the only thing they get. The hatcher is who paid gas, recorded for transparency only — it confers no ownership, no status, no priority, and feeds no airdrop, ranking, or "founding hatcher" badge. The token mints to the contract regardless of who calls, and rightful ownership is recovered at bonding because the attestation signs the stored hash. Front-running poisons attribution and nothing more, which stays harmless precisely because the hatcher is valueless.

- **Client UUID checks are advisory, not an on-chain guarantee.** The plugin and dApp validate that a UUID is well-formed before hashing it, but the contract accepts any non-zero `bytes32` and never sees a UUID. Treat client-side validation as a convenience that stops you from hashing junk, not as a chain-enforced authenticity check.
- **Identity-matching brittleness.** When bonding activates, the attestation signer bridges off-chain identity verification to on-chain bonding. A leaked signer key or compromised off-chain oracle could let a wrong wallet bond a token. Mitigation: signer rotation + attestation expiry.
- **Smart-wallet recipients.** `bond()` uses `_transfer` (no `onERC721Received` callback). Bonding to a contract wallet that cannot surface ERC-721 tokens effectively bricks the buddy. The dApp warns on contract-wallet recipients; the contract itself does not gate on recipient type.
- **Public-RPC rate limits.** The default `https://mainnet.base.org` and `https://sepolia.base.org` endpoints rate-limit aggressively. Swap RPC URL in `shared/networks.ts` if you hit limits.

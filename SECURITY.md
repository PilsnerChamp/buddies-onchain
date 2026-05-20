# Security

Your buddy lives on-chain. No one — not Anthropic, not a future maintainer, not the project — can move it, take it, or rewrite it. The rules below are how the contract holds that line.

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

- **Deterministic traits, not random.** Traits are derived from your account UUID plus a fixed salt via wyhash → Mulberry32. Anyone who knows your UUID can precompute your buddy's traits before you hatch. This is by design for reproducible hatching; it is not a secrecy or randomness guarantee.
- **Identity-matching brittleness.** When bonding activates, the attestation signer bridges off-chain identity verification to on-chain bonding. A leaked signer key or compromised off-chain oracle could let a wrong wallet bond a token. Mitigation: signer rotation + attestation expiry.
- **Smart-wallet recipients.** `bond()` uses `_transfer` (no `onERC721Received` callback). Bonding to a contract wallet that cannot surface ERC-721 tokens effectively bricks the buddy. The dApp warns on contract-wallet recipients; the contract itself does not gate on recipient type.
- **Public-RPC rate limits.** The default `https://mainnet.base.org` and `https://sepolia.base.org` endpoints rate-limit aggressively. Swap RPC URL in `shared/networks.ts` if you hit limits.

# Security

Your buddy lives on-chain. No one can move it or take it: the binding to your account's identity hash is set at hatch and never changes, and the token and its deterministic traits are fixed once claimed. Before that, while the contract still holds the buddy, the signer key reaches it through one dormant door: `claim`. A signed claim attestation directs which wallet the buddy lands in, and the same call repairs a token hatched with a foreign seed — it burns that token and re-hatches the identity with the attested seed (new traits, new token id, same identity hash) before handing it over, all in one transaction. A wrong or missing provider label or name is not a foreign seed: the contract corrects it during the claim without any burn. The burn fires on a seed mismatch only. These powers are stated plainly under Maintainer powers. The rendered art is drawn from that record on-chain and can be re-skinned by the maintainer (`setRenderer`); the identity it draws stays yours. The rules below are how the contract holds that line.

## Soulbound posture

The contract holds every buddy. Tokens cannot leave the contract address except through one dormant door — `claim` — attestation-gated and switched off until bonding is enabled. A single `claim` call hands the buddy to its holder exactly once; if the held token carries a foreign seed, the same call burns it and re-hatches the identity before handing it over (squat recovery — details under Known limitations). There is no transfer, no approval, and no burn outside that one call:

- Standard ERC-721 transfer-approval calls (`approve`, `setApprovalForAll`) revert with `Soulbound()`. No wallet — including the holder — can grant permission to move a buddy.
- The internal transfer hook (`_update()`) only allows two kinds of state change: the initial mint, and a one-way exit from contract custody while the buddy is in `Custodial` stage — the claim hand-off, or the wrong-seed burn that runs inside the same `claim` call. Every other state change reverts.
- Once claimed, the buddy sits in the recipient wallet permanently. No un-claim, no re-claim, no rollback.

Trade-offs for users:

- No secondary-market exit. The identity record is permanent and non-transferable.
- No "burn to remove." The on-chain record persists.
- No host takedown. The contract holds the token; the renderer is bytecode.

## Maintainer powers

*Maintainer = the OZ `Ownable` `owner()` role on the contract.*

The maintainer can:

- Point the contract at a different renderer (changes how the SVG art is drawn from on-chain data) — `setRenderer(address)`.
- Rotate the signer key that authorizes claim attestations — `setAttestationSigner(address)`.
- Turn bonding on, once and permanently — `enableBonding()`. Requires a signer already set. Cannot be undone.
- Burn and re-roll any buddy the contract still holds, through the signer key it controls — once bonding is enabled, a signed claim attestation carrying a seed that differs from the stored one makes `claim` burn the token and re-hatch its identity with the attested seed: new traits, new token id, re-attested provider label, same identity hash. Only a seed mismatch triggers this; a wrong provider label or name is corrected without a burn. Bonded buddies are out of reach. This power wakes with `enableBonding()` and is the squat-recovery path described under Known limitations; owner and signer are one trust class.
- Direct, through the same key, where any buddy the contract still holds lands when it is claimed — a signed claim attestation names the recipient, and `claim` checks the signature, the stored identity hash, the stored seed (both public reads a dishonest signer can echo), and that the named recipient submits the call. It never checks who rightfully holds the account. A claim landed this way is permanent and beyond all recovery.
- Hand off the maintainer role to a new address, or drop it entirely — OZ `Ownable.transferOwnership` / `renounceOwnership`. Renouncing reverts while bonding is still disabled (prevents leaving the contract orphaned before users can claim their buddies). Renouncing also freezes the signer: `setAttestationSigner` is owner-only, so after renounce a compromised signer key — and with it the claim power in all its branches — can never be rotated out. The operating rule: do not renounce while contract-held buddies that matter remain unclaimed, or accept that a signer compromise after renounce is unrecoverable.

The maintainer cannot:

- Move a minted buddy directly. The soulbound `_update()` gate blocks every direct transfer, maintainer-initiated included. The one custody exit it allows — the `claim` hand-off, and the wrong-seed burn that runs inside the same call — is attestation-gated and runs through the signer key: the powers disclosed in the can-list above.
- Mint a buddy onto a specific wallet. `hatch()` is permissionless — anyone can hatch any valid UUID and pay gas. The minted buddy is held by the contract address regardless of who called; `_hatcher[tokenId]` records the calling wallet (`msg.sender`) for transparency only and grants no claim to the buddy. Recipient assignment happens later, at `claim`, via signed attestation.
- Turn bonding off after enabling it. Activation is one-way.
- Set the signer to a zero address once bonding is live (would break all future attestation checks).

`claim` is dormant in v1. It ships fully written and tested but reverts `BondingNotEnabled` until the maintainer flips the switch with `enableBonding()`. Until then, every buddy stays inside the contract.

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

- **The hatcher record is attribution only.** `hatch()` is permissionless and the identity hash is visible before a tx confirms, so a front-runner can hatch a hash they saw and become the recorded `hatcher`. That is all they get. The hatcher is who paid gas, recorded for transparency only — no ownership, no status, no priority, and it feeds no airdrop, ranking, or "founding hatcher" badge. The token mints to the contract regardless of caller, and rightful ownership is recovered at claim because the attestation signs the identity hash and the UUID-derived seed — `claim` re-checks both against storage. Front-running poisons attribution and nothing more — harmless because the hatcher is valueless.

- **A squatter can hatch your identity hash with their own seed.** `hatch()` is permissionless and the identity hash is visible before a tx confirms, so anyone who knows a victim's identity hash can hatch it first. Because traits derive from a caller-supplied seed, the squatter can pick or grind any body and traits — body-choice that did not exist when the contract derived the body from identity. The squatted token is contract-held, owned by no one, and unclaimable as-is: `claim` (dormant) re-checks the seed against a signed attestation, and a foreign seed cannot be handed over unchanged. A dead record, not a hijack — the squatter cannot take, sell, or claim it. Nor is the denial permanent: the wrong-seed repair is built into `claim` itself, dormant behind the same switch as the rest of the door. With a signed attestation carrying the identity's true UUID-derived seed, `claim` burns the squat and re-hatches the identity in the same transaction before handing it over — no gap for a re-squat. The attestation names the wallet allowed to submit it, so a leaked signature is useless in other hands. The burn fires on a seed mismatch only — a wrong provider label or name is corrected in place, never destroyed — so under a signer attesting the UUID-derived seed an honest token is handed over without a burn, and bonded tokens are out of reach entirely (a dishonest signer's reach is the maintainer-power disclosure above). The replacement takes a new token id; the squat's id is burned and never reused (`totalSupply()` counts issued ids, so it runs ahead of live tokens after a wrong-seed replacement), and identity lookup points at the replacement. Two protections hold the line: the identity hash is secret-ish before mint (a squatter must already know the victim's hash), and the buddy is valueless. Permissionless mint-once always allowed squat-denial; the caller-supplied seed only adds cosmetic body-choice, which confers nothing because the token has no value.

- **Client UUID checks are advisory, not an on-chain guarantee.** The plugin and dApp validate that a UUID is well-formed before hashing it, but the contract accepts any non-zero `bytes32` and never sees a UUID. Client-side validation stops you from hashing junk; it is not a chain-enforced authenticity check.
- **Identity-matching brittleness.** Once bonding activates, the attestation signer bridges off-chain identity verification to on-chain claiming. A leaked signer key or compromised off-chain oracle could let a wrong wallet claim a token — and, on the wrong-seed branch, burn and re-roll the seed and traits of any token the contract still holds under its identity hash; bonded tokens are beyond the signer's reach. Mitigation: signer rotation and attestation expiry. Because the maintainer controls `setAttestationSigner`, the signer is a maintainer-controlled key: the maintainer could rotate it to a key they hold and authorize claims directly, so owner and signer are one trust class, not two. The signer is an authorization and accountability gate, not a truth oracle — it attests what it is given and never checks who rightfully holds the account. The rotation is an on-chain transaction and is publicly auditable.
- **Provider and name are attested, not cryptographically true.** The provider label and the name carried in a claim attestation are soft metadata: a user can feed the dApp a false value and the signer signs what it is given. The signer gates authorization and accountability, not truth. Only the seed carries identity and art-validity. A wrong or missing provider or name is corrected at claim — provider overwritten, name set — without destroying anything; the burn fires on a seed mismatch only.
- **Smart-wallet recipients.** The `claim` hand-off uses `_transfer` (no `onERC721Received` callback). Claiming to a contract wallet that cannot surface ERC-721 tokens effectively bricks the buddy. The dApp warns on contract-wallet recipients; the contract itself does not gate on recipient type.
- **Public-RPC rate limits.** The default `https://mainnet.base.org` and `https://sepolia.base.org` endpoints rate-limit aggressively. Swap RPC URL in `shared/networks.ts` if you hit limits.

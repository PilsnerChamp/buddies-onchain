# BuddyNFT contract

Soulbound on-chain identity record. Permissionless `hatch(identityHash, prngSeed, provider)`. Two-stage lifecycle: `Hatched` (implemented) and `Bonded` (dormant in v1). Fully on-chain SVG renderer.

## Stage labels

User-facing: `Hatched`, `Bonded`. Enum identifiers (internal): `Custodial`, `Bonded`. `Custodial` mirrors the on-chain custody fact — the contract holds the token at `address(this)` until bonding activates.

## Hatch

```solidity
function hatch(bytes32 identityHash, uint32 prngSeed, bytes16 provider) external returns (uint256 tokenId);
```

No authorization signature. Anyone can call `hatch()` and pay gas to hatch any non-zero identity hash. Caller supplies all three args. The contract stores `prngSeed` and derives traits from it; it does not derive the seed itself. Compute `identityHash` and `prngSeed` client-side — see [`docs/onchain/derivation.md`](derivation.md). On-chain steps:

1. Revert `InvalidIdentityHash` if `identityHash == bytes32(0)`. `prngSeed == 0` is valid.
2. Revert `AlreadyHatched` if `_minted[identityHash]`.
3. Revert `InvalidProvider` if `provider` fails the validation rules below.
4. `traits = Mulberry32.deriveTraits(prngSeed)`.
5. `tokenId = _nextTokenId++`.
6. Write all per-token mappings before mint, including `_tokenPrngSeeds[tokenId] = prngSeed` and `_tokenProviders[tokenId] = provider`. Stage starts `Custodial`. `_hatcher[tokenId] = msg.sender` (transparency only — not an ownership record, does not grant transfer rights).
7. `_mint(address(this), tokenId)` — the contract mints the token to itself.
8. Emit `Awakened(tokenId, identityHash, msg.sender, provider)`.

### Provider

`provider` is a self-declared `bytes16` label for the originating AI coding tool — `"claude"` for the v1 plugin. Stored verbatim, never validated against any registry. Same trust model as `identityHash` and `prngSeed`: the chain attests it stays consistent, not that the label is true.

Validation (`InvalidProvider` on any breach):

- First byte non-null — the empty value is rejected.
- Allowed bytes `[a-z0-9-]` (lowercase ASCII, digits, hyphen).
- Null padding tail-only — the first `0x00` begins the padding tail; every byte after it must stay null. No interior nulls.

A full 16-byte value with no padding is valid. The renderer trims the padding tail for the `Provider` attribute.

Token name is empty at hatch and never written here. Gas ~229,357.

The chain proves `traits == Mulberry32.deriveTraits(storedSeed)` — consistency anyone can recompute, not authenticity. It does not prove the seed came from any particular identity. `identityHash` is the privacy, lookup, and uniqueness key only; uniqueness keys on `_minted[identityHash]` alone. Authenticity is re-established at Stage 2 (`bond()`, dormant in v1).

## Bond (dormant in v1)

```solidity
struct BondAttestation {
    uint256 tokenId;
    bytes32 identityHash;
    uint32 prngSeed;
    address recipient;
    uint64 expiry;
}

function bond(
    uint256 tokenId,
    string calldata name,
    BondAttestation calldata attestation,
    bytes calldata signature
) external;
```

Reverts `BondingNotEnabled` until the maintainer calls `enableBonding()`. When active: stage gate (`Custodial` only) acts as the replay guard, EIP-712 signature verifies against `_attestationSigner`, name is written, token transfers from `address(this)` to `msg.sender`, stage flips to `Bonded`. Bonded is terminal. After the flip, emits `Locked(tokenId)` (ERC-5192) and `MetadataUpdate(tokenId)` (ERC-4906) — see [Marketplace interfaces](#marketplace-interfaces).

`bond()` re-checks the supplied `prngSeed` against the token's stored seed (squat resistance, Decision-10/11): a token hatched with a seed that does not derive from its identity UUID can never bond. An integrator signing a `BondAttestation` must include `prngSeed` — the EIP-712 digest hashes all five fields by position, so an omitted or wrong seed never matches.

## Reclaim (dormant in v1)

```solidity
struct ReclaimAttestation {
    uint256 tokenId;
    bytes32 identityHash;
    uint32 prngSeed;
    bytes16 provider;
    address reclaimer;
    uint64 expiry;
}

function reclaimAndHatch(
    ReclaimAttestation calldata attestation,
    bytes calldata signature
) external returns (uint256 newTokenId);
```

Distinct struct and EIP-712 typehash from `BondAttestation` — a signed bond can never replay as a reclaim or vice versa. Reverts `BondingNotEnabled` until `enableBonding()`. Signer-gated recovery of a squatted custodial token: it burns the stale token and re-hatches the identity to a new custodial token and seed in one transaction, with no gap for a re-squat. New token id, new traits, re-validated provider label, same identity hash.

When active, on-chain checks: `_requireOwned(tokenId)` first (a burned or never-minted id reverts), stage gate (`Custodial` only), stored identity-hash match, and the inverse of the `bond()` predicate — the attested `prngSeed` must *differ* from the stored seed, so an honest token can never be reclaimed. The attested `reclaimer` must submit the call (a leaked signature is useless in other hands), expiry is enforced, provider is re-validated, EIP-712 signature verifies against `_attestationSigner`. Then `_burn(oldTokenId)`, the identity registry is released, and `_mintBuddy` issues the replacement. The replacement stays `Custodial` — bonding it is a separate, seed-checked `bond()` step. Emits `Reclaimed(oldTokenId, newTokenId, identityHash, reclaimer)`. Bonded tokens are out of reach. Owner and signer are one trust class — see [`SECURITY.md`](../../SECURITY.md#known-limitations).

## Invariants

- `ownerOf(tokenId) == address(this)` for every `Custodial` token, always.
- No custody exit out of `address(this)` except `bond()` (transfer) and `reclaimAndHatch()` (burn), both while `bondingEnabled == true`.
- `bondingEnabled` is one-way. Once `true`, it cannot be set back to `false`.
- `enableBonding()` requires `_attestationSigner != address(0)`.
- `approve` and `setApprovalForAll` revert `Soulbound()`.
- `_update()` allows two branches: mint (`from == address(0)`) and a one-way custodial exit (`from == address(this) && stage == Custodial`). The custodial-exit branch covers both the `bond()` transfer to `msg.sender` and the `reclaimAndHatch()` burn (`to == address(0)`). Everything else reverts `Soulbound()`.

## Storage layout

Per-token: `_tokenTraits` (`BuddyTraits`), `_tokenNames` (empty until `bond()`), `_tokenStages` (enum), `_tokenIdentityHashes` (`bytes32`), `_tokenPrngSeeds` (`uint32`), `_tokenProviders` (`bytes16`, self-declared at hatch), `_hatcher` (gas-payer, transparency only).

Identity: `_identityHashToTokenId` (`bytes32 -> uint256`, returns `0` on miss), `_minted` (`bytes32 -> bool`, uniqueness key).

Global: `_rendererAddress` (own slot), `_attestationSigner` + `bondingEnabled` (packed in one slot — `address` 20 bytes + `bool` 1 byte fits within 32), `_nextTokenId` (token ids start at 1).

View accessors:

- `IBuddyNFT.buddyPrngSeed(uint256) returns (uint32)` reads the stored seed back. Recompute traits off-chain with `Mulberry32.deriveTraits(buddyPrngSeed(id))` to confirm consistency.
- `IBuddyNFT.buddyProvider(uint256) returns (bytes16)` reads the stored provider label back (raw, with padding). The renderer trims it for the `Provider` attribute.

## Maintainer-only functions

API surface only — trust posture and scope are in [`SECURITY.md`](../../SECURITY.md#maintainer-powers).

- `setRenderer(address)` — swap the renderer contract. Requires non-zero. Emits `RendererUpdated`, then `BatchMetadataUpdate(0, type(uint256).max)` (ERC-4906).
- `setAttestationSigner(address)` — rotate the bond signer. Reverts `ZeroAddress` while `bondingEnabled == true` and the address is zero.
- `enableBonding()` — one-way activation. Requires `_attestationSigner != address(0)`. Emits `BondingEnabled`.
- `transferOwnership(address)` / `renounceOwnership()` — OZ `Ownable`. Renounce reverts while `bondingEnabled == false` to prevent permanent loss of the Stage 2 path.

## Marketplace interfaces

`supportsInterface(bytes4)`:

| Standard | id | Result |
|---|---|---|
| ERC-165 | `0x01ffc9a7` | `true` |
| ERC-721 | `0x80ac58cd` | `true` |
| ERC-721 Metadata | `0x5b5e139f` | `true` |
| ERC-4906 (metadata update) | `0x49064906` | `true` |
| ERC-5192 (soulbound) | `0xb45a3c0e` | `true` |
| EIP-2981 (royalties) | `0x2a55205a` | `false` |

No royalty interface — soulbound, no secondary-sale path. ERC-7572 (`contractURI`) is presence-detected and carries no ERC-165 bit.

### ERC-4906 — metadata update signal

Marketplaces and indexers refetch metadata on these events:

- `MetadataUpdate(uint256 tokenId)` — emitted by `bond()` after the `Hatched`→`Bonded` flip.
- `BatchMetadataUpdate(0, type(uint256).max)` — emitted by `setRenderer()` after the renderer swap, covering the whole collection.

### ERC-5192 — soulbound signal

```solidity
function locked(uint256 tokenId) external view returns (bool);
```

`false` while `Custodial`, `true` once `Bonded`. Reverts for nonexistent tokens. `bond()` emits `Locked(uint256 tokenId)` after the flip. `Unlocked` is part of the interface but never emitted — bonding is one-way.

### ERC-7572 — collection metadata

```solidity
function contractURI() external pure returns (string memory);
```

Returns a `data:application/json;utf8,` payload with `name`, `description`, `image`, and `external_link`. Immutable.

## Renderer

`BuddyRenderer` is a separate contract referenced by `_rendererAddress`. `tokenURI(uint256)` returns a base64 data URL with on-chain SVG. Three modes:

- Chrome strip — terminal-style header band with the `> /buddy-onchain` sigil. Rendered from `BuddyFont`.
- Sprite — the buddy itself, rendered from `BuddySpriteData` via `BuddySpriteFont`.
- Plain fallback — sprite without chrome when chrome assets are unavailable.

Fonts ship as WOFF2 payloads embedded on-chain. The SVG embeds Iosevka and DejaVu Sans Mono, both permissively licensed.

## Identity-hash construction

BuddyNFT is hash-only and never sees the raw UUID. Callers compute:

```text
identityHash = keccak256("buddies-onchain:identity:claude:v1" || 0x1f || lowercase(accountUuid))
```

Shared impl: `shared/computeIdentityHash.ts`. The domain tag omits chain id and contract address, so one account hashes to the same `identityHash` on every network (local, Sepolia, mainnet). The trait seed is a separate client-side derivation off the same UUID — see [`docs/onchain/derivation.md`](derivation.md#seed-construction).

Shared callers validate RFC 4122 v4 UUID shape before hashing. That check is advisory and off-chain only — the contract accepts any non-zero `bytes32` and never validates a UUID. See [`docs/onchain/derivation.md`](derivation.md#uuid-validation).

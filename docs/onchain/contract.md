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

The chain proves `traits == Mulberry32.deriveTraits(storedSeed)` — consistency anyone can recompute, not authenticity. It does not prove the seed came from any particular identity. `identityHash` is the privacy, lookup, and uniqueness key only; uniqueness keys on `_minted[identityHash]` alone. Authenticity is re-established at Stage 2 (`claim()`, dormant in v1).

## Claim (dormant in v1)

One public Stage-2 door. `claim` is both the user verb ("claim my buddy") and the sole on-chain selector. Bonding and wrong-seed repair are internal mechanics — no public `bond` or `reclaim` function exists.

```solidity
struct ClaimAttestation {
    bytes32 identityHash;
    uint32 prngSeed;
    bytes16 provider;
    string name;       // signed; "" allowed; <= 14 bytes
    address recipient;
    uint64 expiry;
}

function claim(
    ClaimAttestation calldata attestation,
    bytes calldata signature
) external returns (uint256 tokenId);
```

Reverts `BondingNotEnabled` until the maintainer calls `enableBonding()`. No `tokenId` in the attestation — the contract resolves token state from `identityHash` at execution time, so a signed claim can never replay against a burned or wrong token id. Bonded state is the replay nonce: once an identity is bonded, every later `claim` reverts `AlreadyBonded()`.

Check order, all reverts before any effect:

1. `BondingNotEnabled` if `!bondingEnabled`.
2. `InvalidIdentityHash` if `identityHash == bytes32(0)`.
3. `InvalidProvider` if `provider` fails the [provider rules](#provider).
4. `NameTooLong` if `bytes(name).length > 14`.
5. `InvalidAttestation` if `recipient != msg.sender` — leaked-signature and relayer protection.
6. `AttestationExpired` if `expiry < block.timestamp`.
7. EIP-712 signature verifies against `_attestationSigner`, else `InvalidSignature`.

The contract then resolves state from live storage and branches in one atomic transaction:

| State | Action | Seed | Provider | Name |
|---|---|---|---|---|
| no token (`!_minted[identityHash]`) | mint, then bond | set from attestation | set | set |
| custodial, stored seed == attested | bond, no burn | unchanged | overwrite | set |
| custodial, stored seed != attested | burn + remint, then bond | new token gets attested seed | set on remint | set on remint |
| bonded | revert `AlreadyBonded()` | — | — | — |

The burn predicate is seed-only. A wrong or missing `provider` or `name` is not invalid — both are signer-attested soft metadata, corrected at claim without a burn (provider overwritten, name set). Only a stored-seed mismatch burns and remints. Invalid means wrong seed only.

`provider` and `name` are attested, not guaranteed: a user can feed the dApp a false value and the signer signs what it is given. The signer is an authorization and accountability gate, not a truth oracle. Only the seed carries identity and art validity.

Returns the final bonded token id — the existing id on the honest branch, the new id on the no-token and wrong-seed branches. The whole call is atomic; there is no repair-only success. Tokens minted inside `claim()` record `_hatcher = msg.sender`.

### EIP-712 typehash

```solidity
bytes32 private constant CLAIM_ATTESTATION_TYPEHASH = keccak256(
    "ClaimAttestation(bytes32 identityHash,uint32 prngSeed,bytes16 provider,string name,address recipient,uint64 expiry)"
);
```

The struct hash encodes `name` as `keccak256(bytes(name))` (dynamic string per EIP-712), not the raw bytes. Integrators signing a `ClaimAttestation` must match these UTF-8 bytes and the struct field order exactly, or the signature never verifies.

### Terminal event

```solidity
event BuddyClaimed(
    uint256 indexed tokenId,
    bytes32 indexed identityHash,
    address indexed recipient,
    string name
);
```

The bond tail always ends `Locked → MetadataUpdate → BuddyClaimed`. `MetadataUpdate(tokenId)` fires on every branch because provider is overwritten and name set on each. Full event order per branch:

- honest custodial: `Transfer` (custody → recipient) → `Locked` → `MetadataUpdate` → `BuddyClaimed`
- no-token: `Transfer` (mint) → `Awakened` → `Locked` → `MetadataUpdate` → `BuddyClaimed`
- wrong-seed: `Reclaimed` → `Transfer` (burn) → `Transfer` (mint) → `Awakened` → `Locked` → `MetadataUpdate` → `BuddyClaimed`

Owner and signer are one trust class — claiming is not trustless. "Correct seed" and "wrong seed" mean correct or wrong under the attestation signer, not cryptographically known by the contract. See [`SECURITY.md`](../../SECURITY.md#known-limitations).

## Invariants

- `ownerOf(tokenId) == address(this)` for every `Custodial` token, always.
- No custody exit out of `address(this)` except inside `claim()` — the bond transfer to `msg.sender` and the wrong-seed burn, both while `bondingEnabled == true`.
- `bondingEnabled` is one-way. Once `true`, it cannot be set back to `false`.
- `enableBonding()` requires `_attestationSigner != address(0)`.
- `approve` and `setApprovalForAll` revert `Soulbound()`.
- `_update()` allows two branches: mint (`from == address(0)`) and a one-way custodial exit (`from == address(this) && stage == Custodial`). The custodial-exit branch covers both the bond transfer to `msg.sender` and the wrong-seed burn (`to == address(0)`). Everything else reverts `Soulbound()`.

## Storage layout

Per-token: `_tokenTraits` (`BuddyTraits`), `_tokenNames` (empty until `claim()`), `_tokenStages` (enum), `_tokenIdentityHashes` (`bytes32`), `_tokenPrngSeeds` (`uint32`), `_tokenProviders` (`bytes16`, self-declared at hatch, overwritten at claim), `_hatcher` (gas-payer, transparency only).

Identity: `_identityHashToTokenId` (`bytes32 -> uint256`, returns `0` on miss), `_minted` (`bytes32 -> bool`, uniqueness key).

Global: `_rendererAddress` (own slot), `_attestationSigner` + `bondingEnabled` (packed in one slot — `address` 20 bytes + `bool` 1 byte fits within 32), `_nextTokenId` (token ids start at 1).

View accessors:

- `IBuddyNFT.buddyPrngSeed(uint256) returns (uint32)` reads the stored seed back. Recompute traits off-chain with `Mulberry32.deriveTraits(buddyPrngSeed(id))` to confirm consistency.
- `IBuddyNFT.buddyProvider(uint256) returns (bytes16)` reads the stored provider label back (raw, with padding). The renderer trims it for the `Provider` attribute.

## Maintainer-only functions

API surface only — trust posture and scope are in [`SECURITY.md`](../../SECURITY.md#maintainer-powers).

- `setRenderer(address)` — swap the renderer contract. Requires non-zero. Emits `RendererUpdated`, then `BatchMetadataUpdate(0, type(uint256).max)` (ERC-4906).
- `setAttestationSigner(address)` — rotate the claim-attestation signer. Reverts `ZeroAddress` while `bondingEnabled == true` and the address is zero.
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

- `MetadataUpdate(uint256 tokenId)` — emitted by `claim()` after the `Hatched`→`Bonded` flip.
- `BatchMetadataUpdate(0, type(uint256).max)` — emitted by `setRenderer()` after the renderer swap, covering the whole collection.

### ERC-5192 — soulbound signal

```solidity
function locked(uint256 tokenId) external view returns (bool);
```

`false` while `Custodial`, `true` once `Bonded`. Reverts for nonexistent tokens. `claim()` emits `Locked(uint256 tokenId)` after the flip. `Unlocked` is part of the interface but never emitted — bonding is one-way.

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

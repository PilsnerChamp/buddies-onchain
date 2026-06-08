# BuddyNFT contract

Soulbound on-chain identity record. Permissionless `hatch(identityHash, prngSeed)`. Two-stage lifecycle: `Hatched` (implemented) and `Bonded` (dormant in v1). Fully on-chain SVG renderer.

## Stage labels

User-facing: `Hatched`, `Bonded`. Enum identifiers (internal): `Custodial`, `Bonded`. `Custodial` mirrors the on-chain custody fact — the contract holds the token at `address(this)` until bonding activates.

## Hatch

```solidity
function hatch(bytes32 identityHash, uint32 prngSeed) external returns (uint256 tokenId);
```

No authorization signature. Anyone can call `hatch()` and pay gas to hatch any non-zero identity hash. Caller supplies both args. The contract stores `prngSeed` and derives traits from it; it does not derive the seed itself. Compute both client-side — see [`docs/onchain/derivation.md`](derivation.md). On-chain steps:

1. Revert `InvalidIdentityHash` if `identityHash == bytes32(0)`. `prngSeed == 0` is valid.
2. Revert `AlreadyHatched` if `_minted[identityHash]`.
3. `traits = Mulberry32.deriveTraits(prngSeed)`.
4. `tokenId = _nextTokenId++`.
5. Write all per-token mappings before mint, including `_tokenPrngSeeds[tokenId] = prngSeed`. Stage starts `Custodial`. `_hatcher[tokenId] = msg.sender` (transparency only — not an ownership record, does not grant transfer rights).
6. `_mint(address(this), tokenId)` — the contract mints the token to itself.
7. Emit `Awakened(tokenId, identityHash, msg.sender)`.

Token name is empty at hatch and never written here. Gas ~212,462.

The chain proves `traits == Mulberry32.deriveTraits(storedSeed)` — consistency anyone can recompute, not authenticity. It does not prove the seed came from any particular identity. `identityHash` is the privacy, lookup, and uniqueness key only; uniqueness keys on `_minted[identityHash]` alone. Authenticity is re-established at Stage 2 (`bond()`, dormant in v1).

## Bond (dormant in v1)

```solidity
struct BondAttestation {
    uint256 tokenId;
    bytes32 identityHash;
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

Reverts `BondingNotEnabled` until the maintainer calls `enableBonding()`. When active: stage gate (`Custodial` only) acts as the replay guard, EIP-712 signature verifies against `_attestationSigner`, name is written, token transfers from `address(this)` to `msg.sender`, stage flips to `Bonded`. Bonded is terminal.

## Invariants

- `ownerOf(tokenId) == address(this)` for every `Custodial` token, always.
- No transfer path out of `address(this)` except `bond()` while `bondingEnabled == true`.
- `bondingEnabled` is one-way. Once `true`, it cannot be set back to `false`.
- `enableBonding()` requires `_attestationSigner != address(0)`.
- `approve` and `setApprovalForAll` revert `Soulbound()`.
- `_update()` allows mint (`from == address(0)`) and the bond path (`from == address(this) && stage == Custodial`). Everything else reverts `Soulbound()`.

## Storage layout

Per-token: `_tokenTraits` (`BuddyTraits`), `_tokenNames` (empty until `bond()`), `_tokenStages` (enum), `_tokenIdentityHashes` (`bytes32`), `_tokenPrngSeeds` (`uint32`), `_hatcher` (gas-payer, transparency only).

Identity: `_identityHashToTokenId` (`bytes32 -> uint256`, returns `0` on miss), `_minted` (`bytes32 -> bool`, uniqueness key).

Global: `_rendererAddress` (own slot), `_attestationSigner` + `bondingEnabled` (packed in one slot — `address` 20 bytes + `bool` 1 byte fits within 32), `_nextTokenId` (token ids start at 1).

View accessor: `IBuddyNFT.buddyPrngSeed(uint256) returns (uint32)` reads the stored seed back. Recompute traits off-chain with `Mulberry32.deriveTraits(buddyPrngSeed(id))` to confirm consistency.

## Maintainer-only functions

API surface only — trust posture and scope are in [`SECURITY.md`](../../SECURITY.md#maintainer-powers).

- `setRenderer(address)` — swap the renderer contract. Requires non-zero. Emits `RendererUpdated`.
- `setAttestationSigner(address)` — rotate the bond signer. Reverts `ZeroAddress` while `bondingEnabled == true` and the address is zero.
- `enableBonding()` — one-way activation. Requires `_attestationSigner != address(0)`. Emits `BondingEnabled`.
- `transferOwnership(address)` / `renounceOwnership()` — OZ `Ownable`. Renounce reverts while `bondingEnabled == false` to prevent permanent loss of the Stage 2 path.

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

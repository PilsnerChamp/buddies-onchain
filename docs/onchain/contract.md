# BuddyNFT contract

Soulbound on-chain identity record. Permissionless `hatch(accountUuid)`. Two-stage lifecycle: `Hatched` (implemented) and `Bonded` (dormant in v1). Fully on-chain SVG renderer.

## Stage labels

User-facing: `Hatched`, `Bonded`. Enum identifiers (internal): `Custodial`, `Bonded`. `Custodial` mirrors the on-chain custody fact — the contract holds the token at `address(this)` until bonding activates.

## Hatch

```solidity
function hatch(string calldata accountUuid) external returns (uint256 tokenId);
```

No authorization signature. Anyone can call `hatch()` and pay gas to hatch any UUID. On-chain steps:

1. Validate UUID format via `_validateUuid`. Revert `InvalidUuidFormat` on any failure. Format rules (RFC 4122 v4 only, lowercase hex, exact pattern): [`docs/onchain/derivation.md`](derivation.md#uuid-validation).
2. `identityHash = keccak256(bytes(accountUuid))`.
3. Revert `AlreadyHatched` if `_minted[identityHash]`.
4. `prngSeed = WyHash.hash(bytes(accountUuid), bytes("friend-2026-401"))`.
5. `traits = Mulberry32.deriveTraits(prngSeed)`.
6. `tokenId = _nextTokenId++`.
7. Write all per-token mappings before mint. Stage starts `Custodial`. `_hatcher[tokenId] = msg.sender` (transparency only — not an ownership record, does not grant transfer rights).
8. `_mint(address(this), tokenId)` — the contract mints the token to itself.
9. Emit `Awakened(tokenId, identityHash, msg.sender)`.

Token name is empty at hatch and never written here.

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

## UUID version lock

BuddyNFT v1 accepts RFC 4122 v4 UUIDs only. The validation gate is permanent for the lifetime of this deployment. Future UUID schemes require a new deploy generation.

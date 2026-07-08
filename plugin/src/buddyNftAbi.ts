// plugin/src/buddyNftAbi.ts
//
// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Vendored copy of `shared/buddyNftAbi.ts`, produced by `bun run sync-shared`
// (wired into `bun run build`). `shared/` is the source of truth; the site
// imports it directly, the mainnet-only plugin ships this self-contained copy.
// Edit `shared/buddyNftAbi.ts` and re-run `bun run sync-shared` — never hand-edit
// this file. Drift is caught by `plugin/test/vendored-shared-parity.test.ts`
// and `just plugin-check-dist`.
//
// Original doc comments from the shared source follow verbatim.

// BuddyNFT ABI subset — only the entries the dApp + plugin read or write.
// Hoisted from `site/src/config/contract.ts` so the plugin's publicClient
// can consume the exact same ABI shape. See `docs/network-config.md` § ABI.
// One file = no drift.
//
// Source of truth: `onchain/out/BuddyNFT.sol/BuddyNFT.json`. The full ABI
// is large (ERC721 standard surface, Ownable, EIP-712 domain); pulling only
// what consumers touch keeps viem type-inference fast and surfaces accidental
// new reads/writes as TS errors when the subset is missing the entry.
//
// `claim` is the single Stage-2 write door. It is DORMANT until the owner
// flips `bondingEnabled` (one-way), so no plugin/site consumer invokes it
// today; the selector + its decodable reverts + the terminal `BuddyClaimed`
// event are carried here so the Stage-2 dApp surface can be wired without an
// ABI scramble. (Reverts `BondingNotEnabled()` while dormant.)
//
// Subset used by the public site and plugin:
//   - hatch(bytes32 identityHash, uint32 prngSeed, bytes16 provider)
//       → uint256 tokenId [write, Stage 1]
//   - claim((bytes32,uint32,bytes16,string,address,uint64) attestation,
//       bytes signature) → uint256 tokenId [write, Stage 2 — dormant]
//   - tokenURI(uint256 tokenId) → string                  [view]
//   - isMinted(bytes32 identityHash) → bool               [view]
//   - getTokenIdByIdentity(bytes32 identityHash) → uint256 [view]
//   - hatcher(uint256 tokenId) → address                  [view]
//   - buddyProvider(uint256 tokenId) → bytes16            [view]
//   - Awakened(uint256, bytes32, address, bytes16) event  [log]
//   - BuddyClaimed(uint256, bytes32, address, string) event [log, Stage 2]
//   - AlreadyHatched() error                              [revert]
//   - InvalidIdentityHash() error                         [revert]
//   - InvalidProvider() error                             [revert]
//   - claim() reverts (Stage 2): BondingNotEnabled, AttestationExpired,
//       InvalidAttestation, InvalidSignature, AlreadyBonded,
//       NameTooLong(uint256), plus the shared InvalidIdentityHash /
//       InvalidProvider — decoded to surface a precise claim-failure reason.
//   - ERC721NonexistentToken(uint256) error (OZ ERC-721)  [revert]
//       tokenURI(missing id) reverts with it; the dApp decodes the errorName
//       to render the /view/<tokenId> miss card instead of a generic error.
//
// `getTokenIdByIdentity` returns `0` when no token has been hatched for the
// given identity hash; `BuddyNFT` token IDs start at 1 so `0` is the
// canonical lookup-miss sentinel.
//
// `as const` is required for viem's type inference — without it, viem
// cannot narrow `useWriteContract({ functionName: 'hatch' })` arguments to
// the bytes32/uint32/bytes16 tuple, nor `claim` to its
// (ClaimAttestation, bytes) tuple where the struct is the component-typed
// inner tuple.
//
// Public references: `docs/onchain/contract.md`, `docs/network-config.md`.

export const BUDDY_NFT_ABI = [
  {
    type: 'function',
    name: 'hatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'identityHash', type: 'bytes32' },
      { name: 'prngSeed', type: 'uint32' },
      { name: 'provider', type: 'bytes16' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'attestation',
        type: 'tuple',
        components: [
          { name: 'identityHash', type: 'bytes32' },
          { name: 'prngSeed', type: 'uint32' },
          { name: 'provider', type: 'bytes16' },
          { name: 'name', type: 'string' },
          { name: 'recipient', type: 'address' },
          { name: 'expiry', type: 'uint64' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'isMinted',
    stateMutability: 'view',
    inputs: [{ name: 'identityHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getTokenIdByIdentity',
    stateMutability: 'view',
    inputs: [{ name: 'identityHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hatcher',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'buddyProvider',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes16' }],
  },
  {
    type: 'event',
    name: 'Awakened',
    anonymous: false,
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'identityHash', type: 'bytes32', indexed: true },
      { name: 'hatcher', type: 'address', indexed: true },
      { name: 'provider', type: 'bytes16', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BuddyClaimed',
    anonymous: false,
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'identityHash', type: 'bytes32', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
    ],
  },
  {
    type: 'error',
    name: 'AlreadyHatched',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidIdentityHash',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidProvider',
    inputs: [],
  },
  {
    type: 'error',
    name: 'BondingNotEnabled',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AttestationExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidAttestation',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidSignature',
    inputs: [],
  },
  {
    type: 'error',
    name: 'AlreadyBonded',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NameTooLong',
    inputs: [{ name: 'length', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'ERC721NonexistentToken',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
  },
] as const;

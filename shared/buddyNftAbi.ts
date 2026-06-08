// shared/buddyNftAbi.ts
//
// BuddyNFT ABI subset — only the entries the dApp + plugin read or write.
// Hoisted from `site/src/config/contract.ts` so the plugin's publicClient
// can consume the exact same ABI shape. See `docs/network-config.md` § ABI.
// One file = no drift.
//
// Source of truth: `onchain/out/BuddyNFT.sol/BuddyNFT.json`. The full ABI
// is large (Stage 2 bond path, ERC721 standard surface, Ownable, EIP-712
// domain); pulling only what consumers touch keeps viem type-inference fast
// and surfaces accidental new reads/writes as TS errors when the subset is
// missing the entry.
//
// Subset used by the public site and plugin:
//   - hatch(bytes32 identityHash, uint32 prngSeed) → uint256 tokenId [write]
//   - tokenURI(uint256 tokenId) → string                  [view]
//   - isMinted(bytes32 identityHash) → bool               [view]
//   - getTokenIdByIdentity(bytes32 identityHash) → uint256 [view]
//   - hatcher(uint256 tokenId) → address                  [view]
//   - Awakened(uint256, bytes32, address) event           [log]
//   - AlreadyHatched() error                              [revert]
//   - InvalidIdentityHash() error                         [revert]
//
// `getTokenIdByIdentity` returns `0` when no token has been hatched for the
// given identity hash; `BuddyNFT` token IDs start at 1 so `0` is the
// canonical lookup-miss sentinel.
//
// `as const` is required for viem's type inference — without it, viem
// cannot narrow `useWriteContract({ functionName: 'hatch' })` arguments to
// the bytes32/uint32 tuple.
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
    type: 'event',
    name: 'Awakened',
    anonymous: false,
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'identityHash', type: 'bytes32', indexed: true },
      { name: 'hatcher', type: 'address', indexed: true },
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
] as const;

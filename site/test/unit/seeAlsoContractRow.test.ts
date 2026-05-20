// site/test/unit/seeAlsoContractRow.test.ts
//
// Covers the chain × status matrix for `seeAlsoContractRow()`. Structure:
//
//   3 chains (31337 local, 84532 base sepolia, 8453 base mainnet)
// × 2 statuses (not-yet-deployed, deployed)
// + 1 unknown-chain case
// Linkability is part of the trust surface: pre-deploy rows stay inert,
// deployed rows link only when the active chain has an explorer.
//
// The production `chains.ts` ships all entries as `not-yet-deployed` in
// this commit (see `docs/site/terminal-ui.md` § SEE ALSO row pattern —
// contract row linkability), so we `vi.mock` the chains module to exercise
// the `deployed` branch. The placeholder address uses Unicode U+2026
// horizontal ellipsis — the test asserts byte-level equality so a future
// refactor that swaps to three ASCII dots fails loudly.
//
// Linkability contract (see `docs/site/terminal-ui.md` § Contract row
// linkability): `href` is `null` whenever the row should render as inert
// plain text. `0x0000…0000` MUST stay inert pre-deploy — an auth-ops
// trust surface bug if it ever becomes clickable.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-chain display labels used by the selector (match the live
// `NETWORKS` entries in `shared/networks.ts`).
const DISPLAY = {
  31337: 'local',
  84532: 'base sepolia',
  8453: 'base',
} as const;

// Per-chain explorer bases used by the selector (match the live
// `NETWORKS` entries in `shared/networks.ts`). 31337 has no public
// explorer — `null` signals pre-deploy-style inert rendering even
// post-deploy.
const EXPLORER = {
  31337: null,
  84532: 'https://sepolia.basescan.org/address/',
  8453: 'https://basescan.org/address/',
} as const;

type MockedStatus = 'not-yet-deployed' | 'deployed';

type ChainFixture = {
  status: MockedStatus;
  address: `0x${string}` | null;
  displayName: string;
  explorerBase: string | null;
};

// Shared mutable fixture map the mocked `chains` module reads from.
// Tests mutate `fixture.<chainId>` in each case to select the branch under
// test, then call `seeAlsoContractRow(chainId)`. An absent entry models
// the unknown-chain branch — `getNetwork()` returns `null`
// for any chainId not configured in `shared/networks.ts`.
const fixture: Record<number, ChainFixture> = {};

// Mock matches the current chains.ts surface: a single `getNetwork`
// accessor returning `NetworkInfo | null`. The old test mocked
// four per-field selectors (chainDisplayName / getContractStatus /
// getContractAddress / getExplorerAddressBase) — those exports are gone.
vi.mock('../../src/config/chains', () => ({
  getNetwork: (chainId: number) => {
    const f = fixture[chainId];
    if (!f) return null;
    // Map the test fixture into a NetworkInfo-shaped struct. Only the
    // fields seeAlsoContractRow reads are populated; other NetworkInfo
    // fields (key, chainId, rpcUrl, deploymentBlock) are not consumed
    // by the selector and would be inert filler.
    return {
      key: 'local' as const,
      chainId,
      rpcUrl: '',
      explorerAddressBase: f.explorerBase,
      displayName: f.displayName,
      buddyNft: f.address,
      status: f.status,
    };
  },
}));

// Import AFTER the mock declaration so the selector binds to the mocked
// module at import time.
import { seeAlsoContractRow } from '../../src/lib/seeAlsoContractRow';

const PLACEHOLDER = '0x0000…0000'; // U+2026 HORIZONTAL ELLIPSIS

beforeEach(() => {
  // Reset the fixture between cases so stale state from one test can't
  // bleed into the next.
  for (const k of Object.keys(fixture)) {
    delete fixture[Number(k)];
  }
});

describe('seeAlsoContractRow — pre-deploy (not-yet-deployed)', () => {
  it('renders placeholder + three-chunk status on base sepolia (84532)', () => {
    fixture[84532] = {
      status: 'not-yet-deployed',
      address: null,
      displayName: DISPLAY[84532],
      explorerBase: EXPLORER[84532],
    };
    expect(seeAlsoContractRow(84532)).toEqual({
      address: PLACEHOLDER,
      statusChunks: ['contract', 'not yet deployed', 'base sepolia'],
      href: null,
      isClickable: false,
    });
  });

  it('renders placeholder + three-chunk status on base mainnet (8453)', () => {
    fixture[8453] = {
      status: 'not-yet-deployed',
      address: null,
      displayName: DISPLAY[8453],
      explorerBase: EXPLORER[8453],
    };
    expect(seeAlsoContractRow(8453)).toEqual({
      address: PLACEHOLDER,
      statusChunks: ['contract', 'not yet deployed', 'base'],
      href: null,
      isClickable: false,
    });
  });

  it('renders placeholder + three-chunk status on local anvil (31337)', () => {
    fixture[31337] = {
      status: 'not-yet-deployed',
      address: null,
      displayName: DISPLAY[31337],
      explorerBase: EXPLORER[31337],
    };
    expect(seeAlsoContractRow(31337)).toEqual({
      address: PLACEHOLDER,
      statusChunks: ['contract', 'not yet deployed', 'local'],
      href: null,
      isClickable: false,
    });
  });

  it('uses Unicode U+2026 horizontal ellipsis — not three ASCII dots', () => {
    // Regression guard — see `docs/site/terminal-ui.md` § Truncation rules
    // (Unicode ellipsis) and § Contract row linkability. A refactor that
    // silently normalizes the glyph would fail here before it reached review.
    fixture[84532] = {
      status: 'not-yet-deployed',
      address: null,
      displayName: DISPLAY[84532],
      explorerBase: EXPLORER[84532],
    };
    const { address } = seeAlsoContractRow(84532);
    expect(address).toContain('…');
    expect(address).not.toContain('...');
  });

  it('is structurally inert across all chains (href null, isClickable false) — docs/site/terminal-ui.md § Contract row linkability', () => {
    // Load-bearing regression guard: auth-ops trust surface breaks if the
    // placeholder address ever becomes clickable. Asserted across every
    // supported chain so a future refactor can't regress one chain silently.
    for (const chainId of [31337, 84532, 8453] as const) {
      fixture[chainId] = {
        status: 'not-yet-deployed',
        address: null,
        displayName: DISPLAY[chainId],
        explorerBase: EXPLORER[chainId],
      };
      const row = seeAlsoContractRow(chainId);
      expect(row.href).toBeNull();
      expect(row.isClickable).toBe(false);
    }
  });
});

describe('seeAlsoContractRow — post-deploy (deployed)', () => {
  it('renders short-formatted address + clickable href on base sepolia', () => {
    fixture[84532] = {
      status: 'deployed',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      displayName: DISPLAY[84532],
      explorerBase: EXPLORER[84532],
    };
    expect(seeAlsoContractRow(84532)).toEqual({
      address: '0x1234…5678',
      statusChunks: ['contract', 'base sepolia'],
      href: 'https://sepolia.basescan.org/address/0x1234567890abcdef1234567890abcdef12345678',
      isClickable: true,
    });
  });

  it('renders short-formatted address + clickable href on base mainnet', () => {
    fixture[8453] = {
      status: 'deployed',
      address: '0xabcdef0123456789abcdef0123456789abcdef01',
      displayName: DISPLAY[8453],
      explorerBase: EXPLORER[8453],
    };
    expect(seeAlsoContractRow(8453)).toEqual({
      address: '0xabcd…ef01',
      statusChunks: ['contract', 'base'],
      href: 'https://basescan.org/address/0xabcdef0123456789abcdef0123456789abcdef01',
      isClickable: true,
    });
  });

  it('renders short-formatted address but NOT clickable on local anvil (no explorer)', () => {
    // Anvil has no public explorer. Selector must leave href null so the
    // caller renders plain text — a speculative Basescan link to a local
    // fork address would 404 and confuse users.
    fixture[31337] = {
      status: 'deployed',
      address: '0xaaaabbbbccccddddeeeeffff0000111122223333',
      displayName: DISPLAY[31337],
      explorerBase: EXPLORER[31337],
    };
    expect(seeAlsoContractRow(31337)).toEqual({
      address: '0xaaaa…3333',
      statusChunks: ['contract', 'local'],
      href: null,
      isClickable: false,
    });
  });

  it('href uses the raw (full) address, not the display-shortened form', () => {
    // Guard: the shortening is lossy — href MUST deep-link to the real
    // address, not the `0x1234…5678` display string.
    fixture[84532] = {
      status: 'deployed',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      displayName: DISPLAY[84532],
      explorerBase: EXPLORER[84532],
    };
    const row = seeAlsoContractRow(84532);
    expect(row.href).toContain(
      '0x1234567890abcdef1234567890abcdef12345678',
    );
    expect(row.href).not.toContain('…');
  });

  it('falls back to the placeholder + inert when status is deployed but address is null (config bug)', () => {
    // Deliberate guard: a half-flipped `chains.ts` entry (status: deployed
    // but buddyNft still null) must not crash and must not surface a
    // misleading `0x` string. Render the placeholder and leave it inert so
    // the bug is visually loud AND non-clickable.
    fixture[84532] = {
      status: 'deployed',
      address: null,
      displayName: DISPLAY[84532],
      explorerBase: EXPLORER[84532],
    };
    expect(seeAlsoContractRow(84532)).toEqual({
      address: PLACEHOLDER,
      statusChunks: ['contract', 'not yet deployed', 'base sepolia'],
      href: null,
      isClickable: false,
    });
  });
});

describe('seeAlsoContractRow — unknown chain', () => {
  it('treats an unconfigured chain ID as not-yet-deployed + inert', () => {
    // No fixture entry for chain 1 (ethereum mainnet). The mocked helpers
    // return `'unknown'` status, `'unknown'` display name, and null explorer —
    // the selector should surface the pre-deploy inert shape.
    expect(seeAlsoContractRow(1)).toEqual({
      address: PLACEHOLDER,
      statusChunks: ['contract', 'not yet deployed', 'unknown'],
      href: null,
      isClickable: false,
    });
  });
});

describe('seeAlsoContractRow — isClickable ↔ href parity', () => {
  it('isClickable is exactly (href !== null) across every branch', () => {
    // Derivation contract: `isClickable` is documentation for call sites,
    // not a second source of truth. Any branch where they diverge is a bug.
    const cases: Array<[number, ChainFixture]> = [
      [
        84532,
        {
          status: 'not-yet-deployed',
          address: null,
          displayName: DISPLAY[84532],
          explorerBase: EXPLORER[84532],
        },
      ],
      [
        84532,
        {
          status: 'deployed',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          displayName: DISPLAY[84532],
          explorerBase: EXPLORER[84532],
        },
      ],
      [
        31337,
        {
          status: 'deployed',
          address: '0xaaaabbbbccccddddeeeeffff0000111122223333',
          displayName: DISPLAY[31337],
          explorerBase: EXPLORER[31337],
        },
      ],
    ];
    for (const [chainId, f] of cases) {
      fixture[chainId] = f;
      const row = seeAlsoContractRow(chainId);
      expect(row.isClickable).toBe(row.href !== null);
      // Reset between cases so one branch's fixture doesn't bleed.
      delete fixture[chainId];
    }
  });
});

// site/test/unit/networks.test.ts
//
// Covers the static map shape + chainId-keyed lookup in `shared/networks.ts`.
// Vitest is already configured for this worktree; running the test here
// keeps the shared module's coverage in the same gate as the rest of the
// site test suite. The plugin can additionally smoke-test the import shape
// via its bun:test runner if needed (no separate test file required for
// pure data assertions).
//
// Reference: docs/network-config.md.

import { describe, it, expect } from 'vitest';
import {
  NETWORKS,
  NETWORKS_BY_CHAIN_ID,
  type NetworkConfig,
  type NetworkKey,
} from '../../../shared/networks';

describe('shared/networks — NETWORKS map', () => {
  it('has exactly three entries: local, sepolia, mainnet', () => {
    expect(Object.keys(NETWORKS).sort()).toEqual([
      'local',
      'mainnet',
      'sepolia',
    ]);
  });

  it.each<[NetworkKey, NetworkConfig]>([
    [
      'local',
      {
        key: 'local',
        chainId: 31337,
        rpcUrl: 'http://127.0.0.1:8545',
        explorerAddressBase: null,
        openseaCollectionUrl: null,
        displayName: 'local',
      },
    ],
    [
      'sepolia',
      {
        key: 'sepolia',
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org',
        explorerAddressBase: 'https://sepolia.basescan.org/address/',
        openseaCollectionUrl: null,
        displayName: 'base sepolia',
      },
    ],
    [
      'mainnet',
      {
        key: 'mainnet',
        chainId: 8453,
        rpcUrl: 'https://mainnet.base.org',
        explorerAddressBase: 'https://basescan.org/address/',
        openseaCollectionUrl: null,
        displayName: 'base',
      },
    ],
  ])('NETWORKS.%s matches the docs/network-config.md § Three networks fixture', (key, expected) => {
    expect(NETWORKS[key]).toEqual(expected);
  });

  it('local network has null explorerAddressBase (anvil has no public explorer)', () => {
    // Load-bearing: callers (`seeAlsoContractRow`, future `getNetwork`) treat
    // `null` as the inert-link sentinel — a refactor that swapped it for a
    // fake URL would make local dev links 404 silently.
    expect(NETWORKS.local.explorerAddressBase).toBeNull();
  });

  it('non-local explorer bases end with `/address/` so callers can append the raw 0x address', () => {
    // Trailing-slash + `/address/` segment are part of the contract.
    // `seeAlsoContractRow` concatenates the address directly without any
    // path assembly, so a missing trailing slash would yield broken URLs.
    expect(NETWORKS.sepolia.explorerAddressBase).toMatch(/\/address\/$/);
    expect(NETWORKS.mainnet.explorerAddressBase).toMatch(/\/address\/$/);
  });

  it('rpcUrl values are public endpoints (no API keys)', () => {
    // Public endpoints only — see `docs/network-config.md` § Public RPC notes.
    // A drift to a paid-provider URL with embedded key would risk credential
    // leakage in the bundled site JS.
    expect(NETWORKS.sepolia.rpcUrl).toBe('https://sepolia.base.org');
    expect(NETWORKS.mainnet.rpcUrl).toBe('https://mainnet.base.org');
  });
});

describe('shared/networks — NETWORKS_BY_CHAIN_ID lookup', () => {
  it.each<[number, NetworkKey]>([
    [31337, 'local'],
    [84532, 'sepolia'],
    [8453, 'mainnet'],
  ])('chainId %d resolves to the %s entry', (chainId, key) => {
    const entry = NETWORKS_BY_CHAIN_ID[chainId];
    expect(entry).toBeDefined();
    expect(entry).toBe(NETWORKS[key]);
  });

  it('unknown chainIds resolve to undefined (no default)', () => {
    // 1 = ethereum mainnet — not configured. Callers MUST handle undefined
    // rather than receive a misleading default. `NETWORKS_BY_CHAIN_ID[1]`
    // is `undefined`, NOT `NETWORKS.local`.
    expect(NETWORKS_BY_CHAIN_ID[1]).toBeUndefined();
    expect(NETWORKS_BY_CHAIN_ID[42]).toBeUndefined();
    expect(NETWORKS_BY_CHAIN_ID[0]).toBeUndefined();
  });

  it('round-trip: NETWORKS[key].chainId is a key in NETWORKS_BY_CHAIN_ID', () => {
    // Structural derivation guard: NETWORKS_BY_CHAIN_ID is built from
    // NETWORKS, so every chainId in NETWORKS must appear in the lookup.
    for (const cfg of Object.values(NETWORKS)) {
      expect(NETWORKS_BY_CHAIN_ID[cfg.chainId]).toBe(cfg);
    }
  });
});

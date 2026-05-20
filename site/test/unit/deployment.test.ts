// site/test/unit/deployment.test.ts
//
// Loader coverage for `src/config/deployment.ts`.
//
// Two layers:
//
// 1. The live `deployments` map — built at module load from
//    `import.meta.glob('../../../onchain/deployments/*.json', …)`. We assert
//    that the committed `onchain/deployments/31337.json` lands at
//    `deployments[31337]` with the canonical anvil values, and that
//    pre-deploy chains (84532/8453) return `undefined`.
//
// 2. The pure `buildDeployments(modules)` helper — exercised with synthetic
//    fixtures so the integrity-assertion branches (chainId mismatch + path
//    shape) can be tested without having to shadow Vite's build-time glob
//    resolution.

import { describe, it, expect } from 'vitest';

import {
  buildDeployments,
  deployments,
  type Deployment,
} from '../../src/config/deployment';

describe('deployments (live glob)', () => {
  it('loads the committed canonical anvil deployment at chainId 31337', () => {
    const d = deployments[31337];
    expect(d).toBeDefined();
    // Type narrowing for the rest of the assertions.
    if (d === undefined) throw new Error('unreachable');

    expect(d.chainId).toBe(31337);
    expect(d.deployer).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(d.buddyNftBlock).toBe(5);

    // EIP-55 checksum guarantee (see `docs/network-config.md` § Deployment
    // manifests): addresses are checksummed before write. Asserting exact
    // case here — a future regression that lowercases the
    // address (e.g. swaps in `cast --to-address` instead of
    // `cast --to-checksum-address`) trips the byte-equality check.
    expect(d.addresses?.BuddyNFT).toBe(
      '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    );
  });

  it('returns undefined for a pre-deploy chain (84532, base sepolia)', () => {
    // No `onchain/deployments/84532.json` is committed pre-deploy-day.
    // `import.meta.glob` enumerates only files that match at build time,
    // so the slot is simply absent — the soft-miss case in
    // `docs/network-config.md` § Deployment manifests. No throw, no error.
    expect(deployments[84532]).toBeUndefined();
  });

  it('returns undefined for a pre-deploy chain (8453, base mainnet)', () => {
    expect(deployments[8453]).toBeUndefined();
  });

  it('returns undefined for an unknown chainId', () => {
    expect(deployments[999_999]).toBeUndefined();
  });
});

describe('buildDeployments (integrity assertions)', () => {
  it('builds a chainId-keyed map from a well-formed module record', () => {
    const fixture: Record<string, Deployment> = {
      '../../../onchain/deployments/31337.json': {
        chainId: 31337,
        deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        buddyNftBlock: 3,
        addresses: {
          BuddyNFT: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
        },
      },
    };
    const out = buildDeployments(fixture);
    expect(out[31337]?.chainId).toBe(31337);
    expect(out[31337]?.addresses?.BuddyNFT).toBe(
      '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    );
  });

  it('throws when payload chainId disagrees with the filename', () => {
    // Wrong-file commit scenario: a mainnet deploy output (chainId 8453)
    // accidentally written to a file named `84532.json`. Without this
    // guard, the loader would silently route the real mainnet address
    // into the testnet slot.
    const fixture: Record<string, Deployment> = {
      '../../../onchain/deployments/84532.json': {
        chainId: 8453, // mismatch — filename says 84532
        deployer: '0x0000000000000000000000000000000000000001',
        buddyNftBlock: 1,
        addresses: { BuddyNFT: '0x0000000000000000000000000000000000000002' },
      },
    };
    expect(() => buildDeployments(fixture)).toThrow(
      /deployment chainId mismatch: payload=8453 filename=84532/,
    );
  });

  it('throws when a path does not match the `<chainId>.json` shape', () => {
    // Defensive guard against a misconfigured glob pattern (e.g. someone
    // widens it to `*.json` and an unrelated file slips in). Loud failure
    // is preferable to silently dropping the entry.
    const fixture: Record<string, Deployment> = {
      '../../../onchain/deployments/notes.json': {
        chainId: 31337,
        deployer: '0x0000000000000000000000000000000000000001',
        buddyNftBlock: 1,
      },
    };
    expect(() => buildDeployments(fixture)).toThrow(
      /unexpected deployment path/,
    );
  });

  it('produces an empty map when given no modules (pre-deploy bootstrap)', () => {
    // Mirrors the day-zero state where no chain has a committed JSON yet.
    expect(buildDeployments({})).toEqual({});
  });
});

describe('Deployment type shape (compile-time)', () => {
  it('allows omitting `addresses` (and individual contract entries)', () => {
    // Type-only assertion — the test compiles iff `addresses` and any
    // entry under it are optional. Consumers must use
    // `d?.addresses?.BuddyNFT` and the type forces that pattern (see
    // `docs/network-config.md` § Deployment manifests).
    const _noAddresses: Deployment = {
      chainId: 31337,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 3,
    };
    const _emptyAddresses: Deployment = {
      chainId: 31337,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 3,
      addresses: {},
    };
    // Touch the bindings so `noUnusedLocals` doesn't reject them.
    expect(_noAddresses.chainId).toBe(31337);
    expect(_emptyAddresses.chainId).toBe(31337);
  });
});

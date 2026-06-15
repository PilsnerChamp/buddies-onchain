// site/test/unit/deployment.test.ts
//
// Loader coverage for `src/config/deployment.ts`.
//
// Two layers:
//
// 1. The live `deployments` map — built at module load from
//    `import.meta.glob('../../../onchain/deployments/*.json', …)`. Any
//    committed manifest loads.
//
// 2. The pure `buildDeployments(modules)` helper — exercised with synthetic
//    fixtures so the integrity-assertion branches (chainId mismatch + path
//    shape) can be tested without having to shadow Vite's build-time glob
//    resolution.
//
// 3. The pure `buildDeploymentsWithEnv(modules, env, activeChainId)` helper —
//    exercised with explicit env objects for the Cloudflare Pages fallback
//    path, without stubbing `import.meta.env`.

import { describe, it, expect } from 'vitest';

import {
  buildDeployments,
  buildDeploymentsWithEnv,
  deployments,
  type Deployment,
} from '../../src/config/deployment';

const ANVIL_BUDDY_NFT = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';
// Synthetic non-local fixtures only; not live Base Sepolia deployment pointers.
const SAMPLE_BUDDY_NFT = '0x000000000000000000000000000000000000bEEF';
const SAMPLE_DEPLOYER = '0x000000000000000000000000000000000000dEaD';
const SAMPLE_BLOCK = 123_456;
const SAMPLE_BLOCK_TEXT = '123456';

describe('deployments (live glob)', () => {
  it('loads the committed anvil deployment at chainId 31337', () => {
    const d = deployments[31337];
    expect(d).toBeDefined();
    if (d === undefined) throw new Error('unreachable');

    expect(d.chainId).toBe(31337);
    expect(d.deployer).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(d.buddyNftBlock).toBe(5);
    expect(d.addresses?.BuddyNFT).toBe(ANVIL_BUDDY_NFT);
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
          BuddyNFT: ANVIL_BUDDY_NFT,
        },
      },
    };
    const out = buildDeployments(fixture);
    expect(out[31337]?.chainId).toBe(31337);
    expect(out[31337]?.addresses?.BuddyNFT).toBe(ANVIL_BUDDY_NFT);
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

describe('buildDeploymentsWithEnv (active-chain env fallback)', () => {
  it('keeps committed manifest precedence over env fallback values', () => {
    const fixture: Record<string, Deployment> = {
      '../../../onchain/deployments/84532.json': {
        chainId: 84532,
        deployer: SAMPLE_DEPLOYER,
        buddyNftBlock: SAMPLE_BLOCK,
        addresses: { BuddyNFT: SAMPLE_BUDDY_NFT },
      },
    };

    const out = buildDeploymentsWithEnv(
      fixture,
      {
        VITE_BUDDY_NFT_ADDRESS: '0x1111111111111111111111111111111111111111',
        VITE_BUDDY_NFT_BLOCK: '1',
      },
      84532,
    );

    expect(out[84532]?.addresses?.BuddyNFT).toBe(SAMPLE_BUDDY_NFT);
    expect(out[84532]?.buddyNftBlock).toBe(SAMPLE_BLOCK);
    expect(out[84532]?.deployer).toBe(SAMPLE_DEPLOYER);
  });

  it('builds selected non-local deployment data from env when no manifest exists', () => {
    const fixture: Record<string, Deployment> = {
      '../../../onchain/deployments/31337.json': {
        chainId: 31337,
        deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        buddyNftBlock: 5,
        addresses: { BuddyNFT: ANVIL_BUDDY_NFT },
      },
    };

    const out = buildDeploymentsWithEnv(
      fixture,
      {
        VITE_BUDDY_NFT_ADDRESS: SAMPLE_BUDDY_NFT,
        VITE_BUDDY_NFT_BLOCK: SAMPLE_BLOCK_TEXT,
      },
      84532,
    );

    const fallback = out[84532];
    expect(fallback).toBeDefined();
    if (fallback === undefined) throw new Error('unreachable');

    expect(fallback).toEqual({
      chainId: 84532,
      buddyNftBlock: SAMPLE_BLOCK,
      addresses: { BuddyNFT: SAMPLE_BUDDY_NFT },
    });
    expect(fallback).not.toHaveProperty('deployer');
    expect(out[31337]?.addresses?.BuddyNFT).toBe(ANVIL_BUDDY_NFT);
  });

  it.each([
    {
      name: 'missing address',
      env: { VITE_BUDDY_NFT_BLOCK: SAMPLE_BLOCK_TEXT },
      message: /VITE_BUDDY_NFT_ADDRESS/,
    },
    {
      name: 'invalid address',
      env: {
        VITE_BUDDY_NFT_ADDRESS: 'not-an-address',
        VITE_BUDDY_NFT_BLOCK: SAMPLE_BLOCK_TEXT,
      },
      message: /VITE_BUDDY_NFT_ADDRESS/,
    },
    {
      name: 'zero address',
      env: {
        VITE_BUDDY_NFT_ADDRESS: '0x0000000000000000000000000000000000000000',
        VITE_BUDDY_NFT_BLOCK: SAMPLE_BLOCK_TEXT,
      },
      message: /VITE_BUDDY_NFT_ADDRESS/,
    },
    {
      name: 'missing block',
      env: { VITE_BUDDY_NFT_ADDRESS: SAMPLE_BUDDY_NFT },
      message: /VITE_BUDDY_NFT_BLOCK/,
    },
    {
      name: 'invalid block',
      env: {
        VITE_BUDDY_NFT_ADDRESS: SAMPLE_BUDDY_NFT,
        VITE_BUDDY_NFT_BLOCK: '42.5',
      },
      message: /VITE_BUDDY_NFT_BLOCK/,
    },
  ])(
    'fails fast for selected non-local chain with no manifest and $name',
    ({ env, message }) => {
      expect(() => buildDeploymentsWithEnv({}, env, 84532)).toThrow(message);
    },
  );

  it('does not require env fallback for local builds with no manifest', () => {
    expect(buildDeploymentsWithEnv({}, {}, 31337)).toEqual({});
  });
});

describe('Deployment type shape (compile-time)', () => {
  it('allows fallback-shaped data without `deployer` and optional `addresses`', () => {
    // Type-only assertion — the test compiles iff env fallback data may omit
    // `deployer`, and iff `addresses` plus any entry under it are optional.
    // Consumers must use `d?.addresses?.BuddyNFT` and the type forces that
    // pattern (see `docs/network-config.md` § Deployment manifests).
    const _fallbackOnly: Deployment = {
      chainId: 84532,
      buddyNftBlock: SAMPLE_BLOCK,
      addresses: { BuddyNFT: SAMPLE_BUDDY_NFT },
    };
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
    expect(_fallbackOnly.chainId).toBe(84532);
    expect(_noAddresses.chainId).toBe(31337);
    expect(_emptyAddresses.chainId).toBe(31337);
  });
});

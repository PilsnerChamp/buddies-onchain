// site/test/unit/chains.test.ts
//
// Covers the `getNetwork(chainId)` accessor in `chains.ts`
// for deployed, pre-deploy, and unknown chainId cases.
//
// `chains.ts` merges static config from `~shared/networks` with the
// per-deploy artifact from `./deployment`. Tests stub the deployment
// loader so the three branches (deployed, pre-deploy, unknown) can be
// driven from fixtures without touching `onchain/deployments/*.json`.
//
// Static config (`~shared/networks`) is NOT mocked — it's the canonical
// reference for chainIds and display names. Tests assert the merged
// shape includes those fields verbatim.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the deployment loader. Each test seeds `deploymentsFixture` with
// the desired payload (or empty for pre-deploy) before importing the
// chains module via dynamic import + vi.resetModules so the merge sees
// the fixture-driven loader result.
type MockDeployment = {
  chainId: number;
  deployer: `0x${string}`;
  buddyNftBlock: number;
  addresses?: Partial<Record<string, `0x${string}`>>;
};

let deploymentsFixture: Partial<Record<number, MockDeployment>> = {};

vi.mock('../../src/config/deployment', () => ({
  get deployments() {
    return deploymentsFixture;
  },
}));

// Import via top-level `import` is fine because each test calls the
// accessor anew — the underlying `deployments` is read at call time
// through the getter above, not captured at module-init.
import { getNetwork } from '../../src/config/chains';

const ANVIL_BUDDY_NFT =
  '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9' as const;

beforeEach(() => {
  deploymentsFixture = {};
});

describe('getNetwork — deployed', () => {
  it('returns NetworkInfo with merged buddyNft + status:deployed for a configured chain with a deployment', () => {
    deploymentsFixture[31337] = {
      chainId: 31337,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 3,
      addresses: { BuddyNFT: ANVIL_BUDDY_NFT },
    };
    expect(getNetwork(31337)).toEqual({
      key: 'local',
      chainId: 31337,
      rpcUrl: 'http://127.0.0.1:8545',
      explorerAddressBase: null,
      openseaItemBase: null,
      openseaCollectionUrl: null,
      displayName: 'local',
      buddyNft: ANVIL_BUDDY_NFT,
      status: 'deployed',
      deploymentBlock: 3n,
    });
  });

  it('coerces buddyNftBlock to bigint (deploymentBlock invariant for log queries)', () => {
    deploymentsFixture[8453] = {
      chainId: 8453,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 12345678,
      addresses: { BuddyNFT: '0x1234567890abcdef1234567890abcdef12345678' },
    };
    const net = getNetwork(8453);
    expect(net?.deploymentBlock).toBe(12345678n);
    expect(typeof net?.deploymentBlock).toBe('bigint');
  });

  it('preserves all static fields from shared/networks (chainId, rpcUrl, displayName, explorerAddressBase, key)', () => {
    deploymentsFixture[84532] = {
      chainId: 84532,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 100,
      addresses: { BuddyNFT: '0xabcdef0123456789abcdef0123456789abcdef01' },
    };
    const net = getNetwork(84532);
    expect(net?.key).toBe('sepolia');
    expect(net?.chainId).toBe(84532);
    expect(net?.rpcUrl).toBe('https://sepolia.base.org');
    expect(net?.displayName).toBe('base sepolia');
    expect(net?.explorerAddressBase).toBe(
      'https://sepolia.basescan.org/address/',
    );
    expect(net?.openseaItemBase).toBeNull();
  });
});

describe('getNetwork — pre-deploy', () => {
  it('returns NetworkInfo with buddyNft:null + status:not-yet-deployed when no deployment payload exists', () => {
    // No `deploymentsFixture[8453]` entry — chain is configured but not
    // yet deployed.
    expect(getNetwork(8453)).toEqual({
      key: 'mainnet',
      chainId: 8453,
      rpcUrl: 'https://mainnet.base.org',
      explorerAddressBase: 'https://basescan.org/address/',
      openseaItemBase: 'https://opensea.io/item/base/',
      openseaCollectionUrl: 'https://opensea.io/collection/buddies-onchain',
      displayName: 'base',
      buddyNft: null,
      status: 'not-yet-deployed',
    });
  });

  it('treats a deployment payload missing the addresses block as pre-deploy', () => {
    deploymentsFixture[31337] = {
      chainId: 31337,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 3,
      // addresses intentionally omitted
    };
    const net = getNetwork(31337);
    expect(net?.status).toBe('not-yet-deployed');
    expect(net?.buddyNft).toBeNull();
    expect(net?.deploymentBlock).toBeUndefined();
  });

  it('treats a deployment payload missing the BuddyNFT key as pre-deploy', () => {
    deploymentsFixture[31337] = {
      chainId: 31337,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 3,
      // BuddyNFT key absent — partial deploy of dependencies only
      addresses: {
        BuddySpriteData: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      },
    };
    const net = getNetwork(31337);
    expect(net?.status).toBe('not-yet-deployed');
    expect(net?.buddyNft).toBeNull();
  });
});

describe('getNetwork — unknown chain', () => {
  it('returns null for an unconfigured chainId (e.g. ethereum mainnet)', () => {
    expect(getNetwork(1)).toBeNull();
  });

  it('returns null even when a deployment payload exists for an unknown chain', () => {
    // Deployment-loader integrity guard would normally catch this, but
    // the merge accessor must also reject unknown chains independently
    // — refusing to surface a NetworkInfo for a chain with no static
    // config (no rpcUrl, no displayName) is the safer posture.
    deploymentsFixture[42161] = {
      chainId: 42161,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 1,
      addresses: { BuddyNFT: '0xabcdef0123456789abcdef0123456789abcdef01' },
    };
    expect(getNetwork(42161)).toBeNull();
  });
});

describe('getNetwork — invariants', () => {
  it('status === "deployed" structurally implies buddyNft !== null', () => {
    // Coverage for the contract documented in chains.ts: the merge logic
    // only ever returns `'deployed'` when a non-empty BuddyNFT address
    // is present. Tested across two chains so a single-chain regression
    // can't slip through.
    deploymentsFixture[31337] = {
      chainId: 31337,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 3,
      addresses: { BuddyNFT: ANVIL_BUDDY_NFT },
    };
    deploymentsFixture[84532] = {
      chainId: 84532,
      deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      buddyNftBlock: 100,
      addresses: { BuddyNFT: '0x1234567890abcdef1234567890abcdef12345678' },
    };
    for (const chainId of [31337, 84532] as const) {
      const net = getNetwork(chainId);
      expect(net?.status).toBe('deployed');
      expect(net?.buddyNft).not.toBeNull();
    }
  });
});

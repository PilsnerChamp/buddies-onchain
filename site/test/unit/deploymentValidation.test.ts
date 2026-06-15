import { describe, expect, it } from 'vitest';

import { assertDeploymentConfig } from '../../src/config/deploymentValidation';

const LOCAL_CHAIN_ID = 31337;
const SEPOLIA_CHAIN_ID = 84532;
// Synthetic non-local fixtures only; not live Base Sepolia deployment pointers.
const SAMPLE_BUDDY_NFT = '0x000000000000000000000000000000000000bEEF';
const SAMPLE_BLOCK_TEXT = '123456';

describe('assertDeploymentConfig', () => {
  it('does not require fallback vars for local/unset-chain builds', () => {
    expect(() =>
      assertDeploymentConfig({
        activeChainId: LOCAL_CHAIN_ID,
        localChainId: LOCAL_CHAIN_ID,
        hasCommittedManifest: false,
        address: undefined,
        block: undefined,
      }),
    ).not.toThrow();
  });

  it('does not require fallback vars when the active non-local chain has a committed manifest', () => {
    expect(() =>
      assertDeploymentConfig({
        activeChainId: SEPOLIA_CHAIN_ID,
        localChainId: LOCAL_CHAIN_ID,
        hasCommittedManifest: true,
        address: undefined,
        block: undefined,
      }),
    ).not.toThrow();
  });

  it('accepts valid fallback vars for a non-local chain without a committed manifest', () => {
    expect(() =>
      assertDeploymentConfig({
        activeChainId: SEPOLIA_CHAIN_ID,
        localChainId: LOCAL_CHAIN_ID,
        hasCommittedManifest: false,
        address: SAMPLE_BUDDY_NFT,
        block: SAMPLE_BLOCK_TEXT,
      }),
    ).not.toThrow();
  });

  it.each([
    { name: 'missing address', address: undefined },
    { name: 'invalid address', address: 'not-an-address' },
    {
      name: 'zero address',
      address: '0x0000000000000000000000000000000000000000',
    },
  ])(
    'throws naming VITE_BUDDY_NFT_ADDRESS for $name on non-local/no-manifest builds',
    ({ address }) => {
      expect(() =>
        assertDeploymentConfig({
          activeChainId: SEPOLIA_CHAIN_ID,
          localChainId: LOCAL_CHAIN_ID,
          hasCommittedManifest: false,
          address,
          block: SAMPLE_BLOCK_TEXT,
        }),
      ).toThrow(/VITE_BUDDY_NFT_ADDRESS/);
    },
  );

  it.each([
    { name: 'missing block', block: undefined },
    { name: 'invalid block', block: '42.5' },
  ])(
    'throws naming VITE_BUDDY_NFT_BLOCK for $name on non-local/no-manifest builds',
    ({ block }) => {
      expect(() =>
        assertDeploymentConfig({
          activeChainId: SEPOLIA_CHAIN_ID,
          localChainId: LOCAL_CHAIN_ID,
          hasCommittedManifest: false,
          address: SAMPLE_BUDDY_NFT,
          block,
        }),
      ).toThrow(/VITE_BUDDY_NFT_BLOCK/);
    },
  );
});

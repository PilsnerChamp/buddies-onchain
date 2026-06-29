import { describe, it, expect } from 'vitest';

import { openseaItemRow } from '../../src/lib/openseaItemRow';

// The committed `onchain/deployments/8453.json` is bundled by the deployment
// glob at test time, so getNetwork(8453) resolves to the live mainnet record.
const MAINNET = 8453;
const LOCAL = 31337;
const SEPOLIA = 84532;
const BUDDY_NFT = '0x5684082F1219eCB61CbD2e8Ec2dF537104a48fc9';

describe('openseaItemRow', () => {
  it('builds the full per-item deep link on Base mainnet — full address, threaded tokenId', () => {
    // Returns the bare href (the titlebar OpenSea icon needs only the link).
    // Full 40-nibble address — the deep-link must not truncate.
    expect(openseaItemRow(MAINNET, 1n)).toBe(
      `https://opensea.io/item/base/${BUDDY_NFT}/1`,
    );
  });

  it('threads the tokenId into the path', () => {
    expect(openseaItemRow(MAINNET, 42n)).toBe(
      `https://opensea.io/item/base/${BUDDY_NFT}/42`,
    );
  });

  it('returns null on local — no OpenSea surface (openseaItemBase null)', () => {
    expect(openseaItemRow(LOCAL, 1n)).toBeNull();
  });

  it('returns null on Base Sepolia — OpenSea sunset testnet support', () => {
    expect(openseaItemRow(SEPOLIA, 1n)).toBeNull();
  });

  it('returns null on an unknown chain', () => {
    expect(openseaItemRow(999999, 1n)).toBeNull();
  });
});

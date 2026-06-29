import { describe, it, expect } from 'vitest';

import { openseaCollectionRow } from '../../src/lib/openseaCollectionRow';

// The committed `onchain/deployments/8453.json` is bundled by the deployment
// glob at test time, so getNetwork(8453) resolves to the live mainnet record
// (status: 'deployed').
const MAINNET = 8453;
const LOCAL = 31337;
const SEPOLIA = 84532;

describe('openseaCollectionRow', () => {
  it('builds the collection row on Base mainnet — full href, protocol-stripped display', () => {
    const row = openseaCollectionRow(MAINNET);
    expect(row).not.toBeNull();
    expect(row?.href).toBe('https://opensea.io/collection/buddies-onchain');
    // Display strips the protocol so the value column reads like the github
    // row (`opensea.io/collection/buddies-onchain`).
    expect(row?.display).toBe('opensea.io/collection/buddies-onchain');
  });

  it('returns null on local — no OpenSea collection (openseaCollectionUrl null)', () => {
    expect(openseaCollectionRow(LOCAL)).toBeNull();
  });

  it('returns null on Base Sepolia — no testnet collection surface', () => {
    expect(openseaCollectionRow(SEPOLIA)).toBeNull();
  });

  it('returns null on an unknown chain', () => {
    expect(openseaCollectionRow(999999)).toBeNull();
  });
});

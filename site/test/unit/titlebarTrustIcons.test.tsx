// Covers the `/view/<tokenId>` card-titlebar trust icons (Part A). The two
// link URLs come from the shared single-selectors; this proves the renderer
// wires them, labels them, and omits the whole set when neither resolves.
//
// getNetwork(8453) resolves to the live mainnet record (bundled
// `onchain/deployments/8453.json`), so mainnet renders both links; local
// (31337) has no OpenSea surface and no explorer base, so nothing renders.

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { titlebarTrustIcons } from '../../src/components/TitlebarTrustIcons';

const MAINNET = 8453;
const LOCAL = 31337;
const BUDDY_NFT = '0x5684082F1219eCB61CbD2e8Ec2dF537104a48fc9';

afterEach(() => {
  cleanup();
});

describe('titlebarTrustIcons', () => {
  it('renders OpenSea (per-item) + Base (contract) links on Base mainnet', () => {
    render(<>{titlebarTrustIcons(7n, MAINNET)}</>);

    const opensea = screen.getByRole('link', {
      name: 'View this buddy on OpenSea',
    });
    // OpenSea deep-links to this exact buddy — full address, threaded tokenId.
    expect(opensea.getAttribute('href')).toBe(
      `https://opensea.io/item/base/${BUDDY_NFT}/7`,
    );
    expect(opensea.getAttribute('target')).toBe('_blank');
    expect(opensea.getAttribute('rel')).toBe('noopener noreferrer');

    const contract = screen.getByRole('link', {
      name: 'View contract on Basescan',
    });
    // Base icon → the BuddyNFT contract on Basescan (raw 40-nibble address).
    expect(contract.getAttribute('href')).toBe(
      `https://basescan.org/address/${BUDDY_NFT}`,
    );

    // Contract-first: the Basescan (chain) glyph leads the pair, OpenSea
    // follows. Locks the trust-anchor ordering decision.
    const labels = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('aria-label'));
    expect(labels).toEqual([
      'View contract on Basescan',
      'View this buddy on OpenSea',
    ]);
  });

  it('returns null on local — no OpenSea surface, no explorer base (both omitted)', () => {
    expect(titlebarTrustIcons(7n, LOCAL)).toBeNull();
  });
});

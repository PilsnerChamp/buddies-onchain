// Covers the SEE ALSO OpenSea collection row in RouteMetadata (Part B). The
// row's URL logic is unit-tested in openseaCollectionRow.test.ts; this proves
// the integration — the row renders on a chain with a live collection,
// positioned between github and the (trust-anchor, last) contract row, and is
// omitted on a chain without one.

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RouteMetadata } from '../../src/components/RouteMetadata';

afterEach(() => {
  cleanup();
});

function rowLabels(): (string | null | undefined)[] {
  return Array.from(document.querySelectorAll('.see-also__row')).map((row) =>
    row.querySelector('.see-also__label')?.textContent,
  );
}

describe('RouteMetadata — SEE ALSO opensea collection row', () => {
  it('renders the opensea row between github and contract on Base mainnet', () => {
    render(
      <MemoryRouter>
        <RouteMetadata chainId={8453} seeAlsoRoutes={[]} />
      </MemoryRouter>,
    );

    const opensea = screen.getByRole('link', { name: /opensea/ });
    expect(opensea.getAttribute('href')).toBe(
      'https://opensea.io/collection/buddies-onchain',
    );

    // Order: github → opensea → contract (contract stays last).
    const labels = rowLabels();
    const gh = labels.indexOf('github');
    const os = labels.indexOf('opensea');
    expect(gh).toBeGreaterThanOrEqual(0);
    expect(os).toBe(gh + 1);
    // Contract row (label = truncated address) is the final row.
    expect(os).toBe(labels.length - 2);
  });

  it('omits the opensea row on local — no collection surface', () => {
    render(
      <MemoryRouter>
        <RouteMetadata chainId={31337} seeAlsoRoutes={[]} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /opensea/ })).toBeNull();
  });
});

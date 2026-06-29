// OpenSea collection row for the shared SEE ALSO footer (`RouteMetadata`, on
// `/`, `/hatch`, `/claim`, bare `/view`, view-miss). Sibling to
// `seeAlsoContractRow.ts` and `openseaItemRow.ts` — same single-selector
// discipline so the collection URL has one home and cannot drift.
//
// Returns `null` (caller omits the row) whenever there is no live OpenSea
// collection — unknown chain, pre-deploy, or `openseaCollectionUrl === null`
// (local/sepolia). Unlike the contract row, OpenSea has no inert placeholder:
// a chain with no collection shows no row at all, not a dead link.
//
// `href` is the full collection URL; `display` strips the protocol so the
// value column reads like the github row (`opensea.io/collection/...`).

import { getNetwork } from '../config/chains';

type OpenseaCollectionRow = {
  display: string;
  href: string;
};

export function openseaCollectionRow(
  chainId: number,
): OpenseaCollectionRow | null {
  const net = getNetwork(chainId);
  if (net === null) return null;

  const { openseaCollectionUrl, status } = net;
  // Pre-deploy or no configured collection → no row. The collection page only
  // exists once the contract is live and listed, so gate on deployed status.
  if (status !== 'deployed' || openseaCollectionUrl === null) {
    return null;
  }

  return {
    display: openseaCollectionUrl.replace(/^https?:\/\//, ''),
    href: openseaCollectionUrl,
  };
}

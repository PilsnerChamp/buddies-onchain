// OpenSea per-item deep link for the `/view/<tokenId>` card titlebar (the
// OpenSea trust icon — links to this exact buddy, what the user sees on
// screen). Sibling to `seeAlsoContractRow.ts` and `openseaCollectionRow.ts`:
// same single-selector discipline so the per-item URL has one home and cannot
// drift across surfaces.
//
// Returns `null` (caller omits the icon) whenever the chain has no OpenSea
// surface — `openseaItemBase === null` for local/sepolia — or the contract is
// pre-deploy. OpenSea, unlike the contract, has no inert placeholder shape: a
// chain with no marketplace should render no icon at all, not a dead link.
//
// Uses the full (unshortened) BuddyNFT address — the deep-link needs all 40
// nibbles.

import { getNetwork } from '../config/chains';

export function openseaItemRow(
  chainId: number,
  tokenId: bigint,
): string | null {
  const net = getNetwork(chainId);
  if (net === null) return null;

  const { openseaItemBase, buddyNft, status } = net;
  // No OpenSea surface (local/sepolia) or pre-deploy → no link. `status ===
  // 'deployed'` structurally guarantees `buddyNft !== null` (see
  // `chains.ts::getNetwork`); the explicit check is a TS narrowing aid.
  if (status !== 'deployed' || buddyNft === null || openseaItemBase === null) {
    return null;
  }

  return `${openseaItemBase}${buddyNft}/${tokenId}`;
}

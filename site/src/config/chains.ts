// Single merge accessor: `getNetwork(chainId)` joins static metadata
// (`shared/networks.ts`) with the per-deploy artifact (`deployment.ts`,
// loaded from `onchain/deployments/<chainId>.json` at Vite build time) into
// one struct.
//
// Pre-deploy invariant: `buddyNft: null` + `status: 'not-yet-deployed'`. Do
// NOT use `0x0000…0000` as a placeholder address — a squatting contract at
// a guessed address would be dangerous. The display string `0x0000…0000`
// belongs in the selector, not in this config.

import { NETWORKS_BY_CHAIN_ID, type NetworkConfig } from '~shared/networks';
import { deployments } from './deployment';

type ContractStatus = 'not-yet-deployed' | 'deployed';

interface NetworkInfo extends NetworkConfig {
  buddyNft: `0x${string}` | null;
  status: ContractStatus;
  // Optional — only present when a deployment JSON exists for the chain.
  // Consumers that need it must guard the field; pre-deploy chains carry
  // no block reference.
  deploymentBlock?: bigint;
}

// Returns the merged static + deployment record for a chain, or `null`
// when `chainId` is not one of the three configured networks. Callers
// surface `null` as "unknown chain" — see `seeAlsoContractRow.ts` for
// the canonical handling pattern (treats `null` as pre-deploy + unknown
// display name).
//
// Returned `status === 'deployed'` is structurally guaranteed to imply
// `buddyNft !== null` — the merge logic only sets `'deployed'` when the
// deployment payload carries a non-empty `BuddyNFT` address. Callers
// don't need to defensively re-check.
export function getNetwork(chainId: number): NetworkInfo | null {
  const staticInfo = NETWORKS_BY_CHAIN_ID[chainId];
  if (!staticInfo) return null;
  const d = deployments[chainId] ?? null;
  if (!d?.addresses?.BuddyNFT) {
    return { ...staticInfo, buddyNft: null, status: 'not-yet-deployed' };
  }
  return {
    ...staticInfo,
    buddyNft: d.addresses.BuddyNFT as `0x${string}`,
    status: 'deployed',
    deploymentBlock: BigInt(d.buddyNftBlock),
  };
}

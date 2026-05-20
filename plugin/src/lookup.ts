// plugin/src/lookup.ts
//
// Cold/warm chain-state decision for the Buddies Onchain plugin.
//
// Given an `accountUuid`, decides whether the user is cold (no on-chain record
// at the user's identity hash) or warm (already hatched).
//
// Decision tree (see docs/network-config.md):
//   1. `getActiveNetwork().buddyNft === null` (pre-deploy chain)
//        => COLD pre-deploy path; no RPC attempted.
//   2. `publicClient.readContract({ functionName: 'getTokenIdByIdentity', ... })`
//      throws (RPC down / rate-limit / malformed)
//        => COLD unavailable path. The dApp uses the same RPC URL
//           (shared/networks.ts), so it does not have a stronger lookup path;
//           callers map this reason against persisted state for graceful UI.
//   3. tokenId === 0n => COLD path (miss; user never hatched).
//   4. tokenId  >  0n => WARM path => `/view/<uuid>`.
//
// Hard-fails (deploy-pipeline integrity violations) bubble up from
// `getActiveNetwork()` — those are NOT user-state issues.
//
// Reference: docs/network-config.md.

import { keccak256, toBytes } from 'viem';
import { BUDDY_NFT_ABI } from '~shared/buddyNftAbi';
import { getActiveNetwork, type PluginNetworkInfo } from './network';
import { getPublicClient } from './publicClient';
import type { NetworkKey } from '~shared/networks';

// Site origin gated on active network key: local dev points at the Vite dev
// server; all other environments (sepolia, mainnet) use the production origin.
export function siteOriginForKey(key: NetworkKey): string {
  return key === 'local' ? 'http://localhost:5173' : 'https://buddies-onchain.xyz';
}

export type LookupReason =
  | 'warm-hatched'
  | 'cold-miss'
  | 'cold-pre-deploy'
  | 'cold-rpc-unavailable';

export interface LookupResult {
  reason: LookupReason;
  /** Set when an on-chain read succeeded; `null` for cold-pre-deploy / soft-fail. */
  tokenId: bigint | null;
}

export function hatchUrl(origin: string, uuid: string): string {
  return `${origin}/hatch?accountUuid=${encodeURIComponent(uuid)}`;
}

export function warmUrl(origin: string, uuid: string): string {
  return `${origin}/view/${encodeURIComponent(uuid)}`;
}

/**
 * Resolve the cold/warm chain state for `uuid` against the active network.
 *
 * Pure with respect to env (reads `getActiveNetwork()` once per call) and
 * RPC (catches all read errors and folds to the cold path). The only way
 * this throws is the deploy-pipeline integrity contract in
 * `getActiveNetwork()` — which is intentional, hard-fail behavior.
 *
 * The UUID is trim+lowercased before the identity-hash keccak input.
 * The contract's `_validateUuid` only accepts the
 * lowercase canonical form (BuddyNFT.sol § _validateUuid), so uppercase
 * caller input would otherwise compute a different identity hash and silently
 * route to the cold path even when an on-chain record exists.
 * Site equivalents do the same canonicalization (`useBuddyLookup.ts:116`,
 * `Hatch.tsx:135`).
 *
 * @param uuid    accountUuid; caller validates shape upstream
 *                (`isValidUuid`). Trim+lowercased here for canonicalization.
 * @param netOverride test seam. Production callers pass no override and let
 *                the function source from the singleton network/client modules.
 */
export async function resolveDeepLink(
  uuid: string,
  netOverride?: PluginNetworkInfo,
): Promise<LookupResult> {
  const canonicalUuid = uuid.trim().toLowerCase();
  const net = netOverride ?? getActiveNetwork();

  // Case 1: pre-deploy chain. Skip the RPC entirely.
  if (net.buddyNft === null) {
    return {
      reason: 'cold-pre-deploy',
      tokenId: null,
    };
  }

  // Case 2-4: contract read.
  const identityHash = keccak256(toBytes(canonicalUuid));
  let tokenId: bigint;
  try {
    tokenId = (await getPublicClient().readContract({
      abi: BUDDY_NFT_ABI,
      address: net.buddyNft,
      functionName: 'getTokenIdByIdentity',
      args: [identityHash],
    })) as bigint;
  } catch {
    // Soft-fail: cold unavailable path.
    return {
      reason: 'cold-rpc-unavailable',
      tokenId: null,
    };
  }

  if (tokenId === 0n) {
    return {
      reason: 'cold-miss',
      tokenId: 0n,
    };
  }

  return {
    reason: 'warm-hatched',
    tokenId,
  };
}

// plugin/src/publicClient.ts
//
// Hardcoded HTTP publicClient for the active runtime chain. Wallet-free —
// the plugin reads `getTokenIdByIdentity` over the public RPC to decide
// between the cold
// (`/hatch#identityHash=...&prngSeed=...&provider=claude`) and warm
// (`/view/<tokenId>`)
// handoff URL.
//
// Lazy construction (`getPublicClient()` returns a singleton built on first
// call) avoids touching the network on plugin boot. Cold-account flows that
// short-circuit before any contract read (no `accountUuid`, pre-deploy chain
// per `getActiveNetwork().buddyNft === null`) never instantiate the client at
// all — keeps the plugin MCP-packaging-friendly and leaves a clean test seam
// (tests can override the singleton via `setPublicClientForTest`).
//
// Reference: docs/network-config.md.

import {
  createPublicClient,
  http,
  type PublicClient,
} from 'viem';
import { base } from 'viem/chains';
import { ACTIVE_NETWORK } from './network';

let _client: PublicClient | null = null;

export function getPublicClient(): PublicClient {
  if (_client === null) {
    // The plugin runtime knows exactly one chain (Base mainnet); no per-key
    // chain dispatch. See `network.ts`.
    _client = createPublicClient({
      chain: base,
      transport: http(ACTIVE_NETWORK.rpcUrl),
    }) as PublicClient;
  }
  return _client;
}

/**
 * Test-only seam: inject a mock client so unit tests can stub
 * `readContract` without spinning up an RPC server. Pass `null` to reset.
 */
export function setPublicClientForTest(client: PublicClient | null): void {
  _client = client;
}

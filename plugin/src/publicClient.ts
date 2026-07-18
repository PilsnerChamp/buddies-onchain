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
let _testOverride: PublicClient | null = null;

// Test-only subprocess seam; BUDDY_TEST_* prefix marks this as non-user
// config (same pattern as BUDDY_TEST_DEPLOYMENTS_DIR in `network.ts`). Lets
// E2E tests point the built bundle at a local JSON-RPC stub.
function resolveRpcUrl(): string {
  return process.env.BUDDY_TEST_RPC_URL || ACTIVE_NETWORK.rpcUrl;
}

export function getPublicClient(): PublicClient {
  if (_testOverride !== null) return _testOverride;
  if (_client === null) {
    // The plugin runtime knows exactly one chain (Base mainnet); no per-key
    // chain dispatch. See `network.ts`.
    _client = createPublicClient({
      chain: base,
      transport: http(resolveRpcUrl()),
    }) as PublicClient;
  }
  return _client;
}

/**
 * Throwaway abortable client for the SessionStart art-cache rebuild. viem's
 * transport `timeout` only bounds the request until response headers arrive;
 * body consumption runs outside it, so a stalled body would pin the hook
 * process past its budget. The caller-owned `signal` covers the whole
 * request including the body, and `retryCount: 0` stops viem's default
 * 3-retry policy from resurrecting an aborted call. Uncached by design —
 * one-shot use; the production singleton keeps its defaults for the slash
 * path.
 */
export function createScopedReadClient(signal: AbortSignal): PublicClient {
  if (_testOverride !== null) return _testOverride;
  return createPublicClient({
    chain: base,
    transport: http(resolveRpcUrl(), {
      retryCount: 0,
      fetchOptions: { signal },
    }),
  }) as PublicClient;
}

/**
 * Test-only seam: inject a mock client so unit tests can stub
 * `readContract` without spinning up an RPC server. The override wins over
 * both the singleton and scoped clients. Pass `null` to reset (also drops
 * any built singleton).
 */
export function setPublicClientForTest(client: PublicClient | null): void {
  _testOverride = client;
  if (client === null) {
    _client = null;
  }
}

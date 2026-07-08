// plugin/src/network.ts
//
// Plugin-side active network. The published plugin targets exactly one chain —
// Base mainnet (chainId 8453) — so there is no runtime network selection and
// no `BUDDY_NETWORK` env override: the plugin "knows one chain." The static
// `NetworkConfig` below is vendored inline (rather than imported from
// `shared/networks.ts`) so the shipped `src/` tree is self-contained; the
// site keeps the broader multi-network `shared/networks.ts` for testnet
// staging. Keep the mainnet values here in sync with that map.
//
// `getActiveNetwork()` merges this static config with the per-chain deployment
// artifact at `plugin/deployments/<chainId>.json` on first call (lazy fs read),
// so plugin boot stays cold-account fast and MCP-packaging-friendly.
//
// Loader semantics mirror site's `buildDeployments`
// (see docs/onchain/build.md):
//   - Missing deployment file => returns `null` (soft case; pre-deploy chain).
//     `getActiveNetwork()` surfaces this as `buddyNft: null` so consumers can
//     soft-fail to the cold/unknown path. NOT a thrown error.
//   - Filename↔payload chainId mismatch => throws (deploy-pipeline bug, hard
//     fail; matches site loader's integrity assertion).
//   - Malformed JSON => throws (deploy-pipeline bug, hard fail).
//
// Reference: docs/network-config.md.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The plugin runtime knows exactly one chain. `NetworkKey` narrows to the
// single mainnet literal; the `NetworkConfig` shape matches the site's
// `shared/networks.ts` entry field-for-field so `PluginNetworkInfo` consumers
// stay portable.
export type NetworkKey = 'mainnet';

export interface NetworkConfig {
  key: NetworkKey;
  chainId: number;
  rpcUrl: string;                          // public, no API key
  explorerAddressBase: string | null;      // null for chains with no public explorer
  openseaItemBase: string | null;          // per-item base (append `<contract>/<tokenId>`); null = no OpenSea surface
  openseaCollectionUrl: string | null;     // full collection page URL; null = no OpenSea collection
  displayName: string;                     // lowercase; UI applies casing
}

// Vendored from `shared/networks.ts` (`NETWORKS.mainnet`). Keep in sync.
export const ACTIVE_NETWORK: NetworkConfig = {
  key: 'mainnet',
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
  explorerAddressBase: 'https://basescan.org/address/',
  openseaItemBase: 'https://opensea.io/item/base/',
  openseaCollectionUrl: 'https://opensea.io/collection/buddies-onchain',
  displayName: 'base',
};

// `Deployment` type duplicates the site-side type intentionally. The shape is
// small (5 fields) and hoisting to `shared/` would require Vite + Bun + tsc
// to all resolve the same module across project boundaries via the JSON-import
// path. If duplication bites later, hoist to `shared/deployment.ts` then.
export type Deployment = {
  chainId: number;
  deployer: `0x${string}`;
  buddyNftBlock: number;
  addresses?: Partial<Record<string, `0x${string}`>>;
};

export interface PluginNetworkInfo extends NetworkConfig {
  buddyNft: `0x${string}` | null;
  deploymentBlock: number | null;
}

// Resolve the deployments dir relative to THIS module's location.
// One segment up from EITHER `plugin/src/network.ts` (dev) or
// `plugin/dist/index.js` (bundled / installed marketplace plugin) lands at
// the plugin root. The plugin owns its own `deployments/` directory —
// vendored from `onchain/deployments/` at release time so the marketplace
// build is self-contained (`${CLAUDE_PLUGIN_ROOT}/deployments/<chainId>.json`).
// Sync script: `bun run sync-deployments` in `plugin/package.json`.
const HERE = dirname(fileURLToPath(import.meta.url));
const DEPLOYMENTS_DIR = resolve(HERE, '..', 'deployments');

/**
 * Load a deployment JSON by chainId. Returns `null` when the file is absent
 * (pre-deploy chain — soft case). Throws on malformed JSON or filename↔
 * payload chainId mismatch (deploy-pipeline bugs — hard fail).
 *
 * Exported for tests; production callers should go through `getActiveNetwork`.
 *
 * @param chainId      Chain id to look up.
 * @param dirOverride  Test seam — when provided, resolves `<dir>/<chainId>.json`
 *                     instead of the default `plugin/deployments/` location.
 *                     Lets the integrity-assertion + malformed-JSON branches
 *                     run against synthetic tmpdir fixtures without polluting
 *                     the real deployments tree mid-test. Default unchanged.
 */
export function loadDeployment(
  chainId: number,
  dirOverride?: string,
): Deployment | null {
  const dir = dirOverride ?? DEPLOYMENTS_DIR;
  const path = resolve(dir, `${chainId}.json`);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const d = JSON.parse(raw) as Deployment;
  // Integrity assertion mirrors site's `buildDeployments`: catches an
  // accidental wrong-file commit (e.g. mainnet output landed in `84532.json`)
  // before the loader silently misroutes the address into the wrong slot.
  if (d.chainId !== chainId) {
    throw new Error(
      `deployment chainId mismatch: payload=${d.chainId} filename=${chainId} path=${path}`,
    );
  }
  return d;
}

/**
 * Merge the static `NetworkConfig` for the active build's chain with the
 * deployment artifact for that chain. Lazy: the fs read happens on the first
 * call, not at module init, so plugin boot stays cold-account fast.
 *
 * - Pre-deploy chain (no JSON) => `buddyNft: null`, `deploymentBlock: null`.
 *   Consumers soft-fail to the cold/unknown hook path.
 * - Malformed JSON / chainId-mismatch => throws (the integrity contract is a
 *   deploy-pipeline guarantee, not a user-state issue).
 */
export function getActiveNetwork(): PluginNetworkInfo {
  // Test-only subprocess seam; BUDDY_TEST_* prefix marks this as non-user config.
  const deploymentDirOverride = process.env.BUDDY_TEST_DEPLOYMENTS_DIR || undefined;
  const d = loadDeployment(ACTIVE_NETWORK.chainId, deploymentDirOverride);
  return {
    ...ACTIVE_NETWORK,
    buddyNft: (d?.addresses?.BuddyNFT as `0x${string}` | undefined) ?? null,
    deploymentBlock: d?.buddyNftBlock ?? null,
  };
}

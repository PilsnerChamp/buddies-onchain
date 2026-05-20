// plugin/src/network.ts
//
// Plugin-side selector for the active network. Reads `BUDDY_NETWORK` from
// the process environment (Bun's native `process.env`) and resolves to one
// of the three entries in `shared/networks.ts`.
//
// Defaults to `mainnet` because the published plugin distribution targets
// the production deployment. Local plugin development overrides via
// `BUDDY_NETWORK=local bun run plugin/src/...` (or equivalent).
//
// `getActiveNetwork()` lazily merges the static `NetworkConfig` with the
// per-chain deployment artifact at `plugin/deployments/<chainId>.json`. The
// merge is lazy (deferred to first call) so plugin boot stays cold-account
// fast and MCP-packaging-friendly: no import-time fs reads, no eager network.
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
import {
  NETWORKS,
  type NetworkConfig,
  type NetworkKey,
} from '~shared/networks';

// Lazy resolution: validation runs on first PROPERTY READ of
// `ACTIVE_NETWORK`, not at module import. The hook subprocess
// (`bun dist/index.js --hook`) imports this module eagerly, but its
// outer try/catch only wraps `runHook()` — a module-init throw bypasses
// the catch and crashes the hook with stderr noise instead of emitting
// the empty-hook JSON contract. Defer the throw so it lands inside the
// catch frame.
//
// Backwards-compatible: existing call sites read properties off
// `ACTIVE_NETWORK` (e.g. `ACTIVE_NETWORK.key`, `...ACTIVE_NETWORK`),
// which the Proxy traps and validates lazily.
function _loadActiveNetwork(): NetworkConfig {
  const key = (process.env.BUDDY_NETWORK ?? 'mainnet') as NetworkKey;
  const n = NETWORKS[key];
  if (!n) {
    throw new Error(
      `Invalid BUDDY_NETWORK: "${key}". Expected one of: ${Object.keys(NETWORKS).join(', ')}.`,
    );
  }
  return n;
}

let _activeCache: NetworkConfig | null = null;
function _active(): NetworkConfig {
  if (_activeCache) return _activeCache;
  _activeCache = _loadActiveNetwork();
  return _activeCache;
}

export const ACTIVE_NETWORK: NetworkConfig = new Proxy({} as NetworkConfig, {
  get: (_, p) => Reflect.get(_active(), p),
  has: (_, p) => Reflect.has(_active(), p),
  ownKeys: () => Reflect.ownKeys(_active()),
  getOwnPropertyDescriptor: (_, p) => {
    const desc = Reflect.getOwnPropertyDescriptor(_active(), p);
    if (desc) desc.configurable = true;
    return desc;
  },
});

// `Deployment` type duplicates the site-side type intentionally. The shape is
// small (4 fields) and hoisting to `shared/` would require Vite + Bun + tsc
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
  const d = loadDeployment(ACTIVE_NETWORK.chainId);
  return {
    ...ACTIVE_NETWORK,
    buddyNft: (d?.addresses?.BuddyNFT as `0x${string}` | undefined) ?? null,
    deploymentBlock: d?.buddyNftBlock ?? null,
  };
}

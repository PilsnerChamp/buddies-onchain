// site/src/config/deployment.ts
//
// Deployment loader. Pulls per-chain JSON from `onchain/deployments/<chainId>.json`
// at build time via Vite's `import.meta.glob` (eager, default-import).
//
// Merge accessor `getNetwork()` in `chains.ts`: docs/network-config.md § Active network accessors.
//
// Why glob (not static import): pre-deploy chains (84532/8453) may have no
// JSON file. Vite's glob enumerates only files that match at build time —
// missing files simply don't appear in the resulting map. A static
// `import dep from '../../../onchain/deployments/84532.json'` would hard-fail
// the build before deploy day.
//
// Why `Partial<Record<…>>`: consumers must handle `undefined` for any chainId
// without a committed deployment JSON. The TS shape forces the optional check
// at call sites. Same applies to `addresses` — a malformed JSON missing the
// addresses block is a runtime possibility, and `d?.addresses?.BuddyNFT` is
// the canonical access pattern.
//
// Filename↔payload chainId integrity: asserted at module load. Catches a
// wrong-file commit (e.g. mainnet output written to a file named `84532.json`)
// before the loader silently misroutes a real address into the wrong slot.
//
// Vite dev-server fs.allow: this module reads files outside `site/`, so
// `vite.config.ts` widens `server.fs.allow` to include `../onchain/deployments`.
// Production builds are
// unaffected — the JSON is bundled at build time and the path is irrelevant at runtime.

import { NETWORKS } from '~shared/networks';
import { ACTIVE_NETWORK } from './network';
import {
  parseBuddyNftAddress,
  parseBuddyNftBlock,
} from './deploymentValidation';

type DeploymentEnv = {
  readonly [key: string]: unknown;
  readonly VITE_BUDDY_NFT_ADDRESS?: string;
  readonly VITE_BUDDY_NFT_BLOCK?: string;
};

export type Deployment = {
  chainId: number;
  // Present in committed manifests. Env fallback data intentionally omits it
  // because the site does not consume deployer and S1 must not synthesize one.
  deployer?: `0x${string}`;
  buddyNftBlock: number;
  addresses?: Partial<Record<string, `0x${string}`>>;
};

// Pure builder factored out of the IIFE so unit tests can exercise the
// integrity-assertion branches with synthetic inputs without having to
// shadow Vite's build-time glob resolution. The production `deployments`
// export below feeds it the real glob; tests feed it fixtures.
export function buildDeployments(
  modules: Record<string, Deployment>,
): Partial<Record<number, Deployment>> {
  const deployments: Array<[number, Deployment]> = [];

  for (const [path, d] of Object.entries(modules)) {
    const match = path.match(/(\d+)\.json$/);
    if (match === null) throw new Error(`unexpected deployment path: ${path}`);
    const filenameChainId = Number(match[1]);
    // Integrity assertion: payload `chainId` must match the filename. Catches
    // accidental wrong-file commits (e.g. mainnet deploy output written to a
    // file named `84532.json`) before the loader silently misroutes a real
    // address into the wrong chain slot.
    if (d.chainId !== filenameChainId) {
      throw new Error(
        `deployment chainId mismatch: payload=${d.chainId} filename=${filenameChainId} path=${path}`,
      );
    }
    deployments.push([filenameChainId, d]);
  }

  return Object.fromEntries(deployments);
}

function buildFallbackDeployment(
  env: DeploymentEnv,
  activeChainId: number,
): Deployment {
  const buddyNftAddress = parseBuddyNftAddress(env.VITE_BUDDY_NFT_ADDRESS);
  if (buddyNftAddress === null) {
    throw new Error(
      `Missing or invalid VITE_BUDDY_NFT_ADDRESS for chain ${activeChainId}.`,
    );
  }

  const buddyNftBlock = parseBuddyNftBlock(env.VITE_BUDDY_NFT_BLOCK);
  if (buddyNftBlock === null) {
    throw new Error(
      `Missing or invalid VITE_BUDDY_NFT_BLOCK for chain ${activeChainId}.`,
    );
  }

  return {
    chainId: activeChainId,
    buddyNftBlock,
    addresses: { BuddyNFT: buddyNftAddress },
  };
}

export function buildDeploymentsWithEnv(
  modules: Record<string, Deployment>,
  env: DeploymentEnv,
  activeChainId: number,
): Partial<Record<number, Deployment>> {
  const deployments = buildDeployments(modules);

  // Manifest precedence: a deployment JSON for the active chain wins over
  // env fallback values. Local/CI also stays buildable without fallback vars.
  if (
    deployments[activeChainId] !== undefined ||
    activeChainId === NETWORKS.local.chainId
  ) {
    return deployments;
  }

  return {
    ...deployments,
    [activeChainId]: buildFallbackDeployment(env, activeChainId),
  };
}

const deploymentModules = import.meta.glob<Deployment>(
  '../../../onchain/deployments/*.json',
  { eager: true, import: 'default' },
);

// Keyed by chainId. Pre-deploy chains simply don't appear (no throw, no
// error). Map is `Partial` because consumers must handle `undefined` for any
// chainId without a committed deployment JSON.
export const deployments: Partial<Record<number, Deployment>> =
  buildDeploymentsWithEnv(
    deploymentModules,
    import.meta.env,
    ACTIVE_NETWORK.chainId,
  );

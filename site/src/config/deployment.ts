// site/src/config/deployment.ts
//
// Deployment loader. Pulls per-chain JSON from `onchain/deployments/<chainId>.json`
// at build time via Vite's `import.meta.glob` (eager, default-import).
//
// Merge accessor `getNetwork()` in `chains.ts`: docs/network-config.md § Active network accessors.
//
// Why glob (not static import): pre-deploy chains (84532/8453) have no JSON
// file. Vite's glob enumerates only files that match at build time — missing
// files simply don't appear in the resulting map. A static
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

export type Deployment = {
  chainId: number;
  deployer: `0x${string}`;
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
  return Object.fromEntries(
    Object.entries(modules).map(([path, d]) => {
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
      return [filenameChainId, d];
    }),
  );
}

const deploymentModules = import.meta.glob<Deployment>(
  '../../../onchain/deployments/*.json',
  { eager: true, import: 'default' },
);

// Keyed by chainId. Pre-deploy chains simply don't appear (no throw, no error).
// Map is `Partial` because consumers must handle `undefined` for any chainId
// without a committed deployment JSON.
export const deployments: Partial<Record<number, Deployment>> =
  buildDeployments(deploymentModules);

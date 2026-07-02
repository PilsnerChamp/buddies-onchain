import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { NETWORKS } from '../shared/networks';
import { assertDeploymentConfig } from './src/config/deploymentValidation';

// `~shared/*` path-alias mirror of the tsconfig `paths` entry. Explicit
// `resolve.alias` chosen over `vite-tsconfig-paths` plugin to avoid the
// extra dep — the alias is one line and the tsconfig + vite config sit
// next to each other so drift is visible in review.
//
// Reference: docs/network-config.md.
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));
// `viem` alias pins `shared/*` imports to the site's own hoisted viem. Safe only
// while viem stays a single hoisted copy (wagmi has no nested viem); a second
// nested viem would silently force the wrong version into shared code.
const viemDir = fileURLToPath(new URL('./node_modules/viem', import.meta.url));
const deploymentsDir = fileURLToPath(
  new URL('../onchain/deployments', import.meta.url),
);

function committedManifestChainIds(): Set<number> {
  if (!existsSync(deploymentsDir)) return new Set();

  const chainIds = new Set<number>();
  for (const entry of readdirSync(deploymentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const chainId = Number(entry.name.slice(0, -'.json'.length));
    if (Number.isSafeInteger(chainId)) chainIds.add(chainId);
  }
  return chainIds;
}

function assertBuildDeploymentConfig(mode: string): void {
  const env = loadEnv(mode, process.cwd(), '');
  // `?? 'local'` (not `||`): an UNSET VITE_CHAIN defaults to local, but an
  // explicitly-empty `VITE_CHAIN=` stays '' and falls through to the
  // unknown-key throw below — matching `network.ts` runtime semantics and
  // failing the build on a cleared Cloudflare var instead of shipping a
  // dApp that white-screens on load.
  const chainKey = env.VITE_CHAIN ?? 'local';
  const activeNetwork = NETWORKS[chainKey as keyof typeof NETWORKS];
  if (activeNetwork === undefined) {
    throw new Error(
      `unknown VITE_CHAIN "${chainKey}". Expected one of: ${Object.keys(NETWORKS).join(', ')}.`,
    );
  }

  const manifestChainIds = committedManifestChainIds();
  assertDeploymentConfig({
    activeChainId: activeNetwork.chainId,
    localChainId: NETWORKS.local.chainId,
    hasCommittedManifest: manifestChainIds.has(activeNetwork.chainId),
    address: env.VITE_BUDDY_NFT_ADDRESS,
    block: env.VITE_BUDDY_NFT_BLOCK,
  });
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertBuildDeploymentConfig(mode);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '~shared': sharedDir,
        viem: viemDir,
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // `../onchain/deployments` widens fs.allow so the dev server can serve
      // up-tree JSON read by `src/config/deployment.ts` via `import.meta.glob`.
      // Narrow allow scope is intentional — exposing the whole `onchain/`
      // tree would surface contract sources, broadcast logs, and ABIs to the
      // dev server. Production builds bundle the JSON at build time and ignore
      // this allow-list.
      //
      // `sharedDir` (../shared) widens fs.allow so the dev server can serve
      // `~shared/networks.ts`, `~shared/buddyNftAbi.ts`, `~shared/isValidUuid.ts`
      // — the alias resolves to an up-tree path that strict fs.allow would
      // 403 otherwise. Production bundling unaffected (Vite bundles at build
      // time and ignores fs.allow). Reuses the alias-target var declared at
      // the top of this file so the two stay in lockstep.
      fs: { allow: ['.', '../onchain/deployments', sharedDir] },
    },
    optimizeDeps: {
      // Narrow dep crawl to the actual SPA entry.
      entries: ['src/main.tsx'],
    },
    build: {
      target: 'es2022',
      // Deliberate: production source maps stay on so anyone can verify the
      // served bundle against the open-source tree.
      sourcemap: true,
    },
  };
});

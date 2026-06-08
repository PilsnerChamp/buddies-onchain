import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

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

// https://vitejs.dev/config/
export default defineConfig({
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
    sourcemap: true,
  },
});

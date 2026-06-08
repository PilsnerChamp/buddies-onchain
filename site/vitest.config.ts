/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Site unit tests render React routes, so Vitest runs in JSDOM. The
// `~shared/*` alias mirrors Vite and tsconfig because Vitest reads this
// config directly. `viem` is pinned to the site's own install so shared modules
// imported from outside `site/` still exercise the site's viem version.
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));
const viemDir = fileURLToPath(new URL('./node_modules/viem', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '~shared': sharedDir,
      viem: viemDir,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    globals: false,
  },
});

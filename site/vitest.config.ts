/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Site unit tests render React routes, so Vitest runs in JSDOM. The
// `~shared/*` alias mirrors Vite and tsconfig because Vitest reads this
// config directly.
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '~shared': sharedDir,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    globals: false,
  },
});

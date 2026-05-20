// site/test/unit/networkSelector.test.ts
//
// Covers `site/src/config/network.ts` — the build-time `VITE_CHAIN` →
// `ACTIVE_NETWORK` selector. Three valid env values + invalid + unset.
//
// Test mechanism: `vi.stubEnv('VITE_CHAIN', '<value>')` mutates
// `import.meta.env` for the running module graph; the selector module is
// re-imported via `vi.resetModules()` + dynamic `import()` so the new env
// value is read at module-init time. `vi.unstubAllEnvs()` restores between
// tests.
//
// `toStrictEqual` (not `toBe`) for value comparison: `vi.resetModules()`
// also re-evaluates the alias-imported `shared/networks.ts`, so the
// `NETWORKS.<key>` reference held by the test module and the one held by
// the freshly-imported selector module are different object identities
// even though their fields are identical. Structural equality is the
// correct contract here.
//
// Invalid VITE_CHAIN now throws a descriptive error at module load,
// rather than silently producing undefined. The test asserts this throw.
//
// Reference: docs/network-config.md § Selectors.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { NETWORKS } from '../../../shared/networks';

describe('site/config/network — ACTIVE_NETWORK selector', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ['local', NETWORKS.local],
    ['sepolia', NETWORKS.sepolia],
    ['mainnet', NETWORKS.mainnet],
  ] as const)('VITE_CHAIN=%s resolves ACTIVE_NETWORK to NETWORKS.%s', async (
    value,
    expected,
  ) => {
    vi.stubEnv('VITE_CHAIN', value);
    const mod = await import('../../src/config/network');
    expect(mod.ACTIVE_NETWORK).toStrictEqual(expected);
    expect(mod.ACTIVE_NETWORK.chainId).toBe(expected.chainId);
    expect(mod.ACTIVE_NETWORK.key).toBe(expected.key);
  });

  it('unset VITE_CHAIN defaults to local (per docs/network-config.md § Selectors)', async () => {
    // `vi.stubEnv` with `undefined` removes the key, exercising the
    // `?? 'local'` nullish-coalescing default in the selector.
    vi.stubEnv('VITE_CHAIN', undefined as unknown as string);
    const mod = await import('../../src/config/network');
    expect(mod.ACTIVE_NETWORK).toStrictEqual(NETWORKS.local);
  });

  it('invalid VITE_CHAIN throws a descriptive error at module load', async () => {
    // A typo'd env var (e.g. VITE_CHAIN=mainnett) now throws a
    // descriptive error at module init rather than silently producing
    // undefined and crashing cryptically on first property access.
    vi.stubEnv('VITE_CHAIN', 'sapsucker');
    await expect(import('../../src/config/network')).rejects.toThrow(
      /Invalid VITE_CHAIN: "sapsucker"\. Expected one of:/,
    );
  });
});

// site/test/unit/appRouting.test.tsx
//
// Covers routing behavior documented in docs/site/architecture.md § Routes:
//   - missing/malformed fragment handoff on `/hatch` redirects to `/`
//   - invalid-handoff warning is emitted before redirect without raw values
//   - unknown paths redirect to `/`
//
// Mounted through `<MemoryRouter>` with `initialEntries`. `Home` is mocked
// to a lightweight stub — this test exercises the router/redirect wiring,
// not the Home surface. `DotGridBackground`'s canvas mount is not a concern
// because the Home stub replaces the whole route element.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Stub Home so the router test doesn't drag in canvas, wagmi, fontsource,
// or the full man-page composition. The stub prints a sentinel so "landed
// on /" is a textContent assertion.
vi.mock('../../src/routes/Home', () => ({
  Home: (): JSX.Element => <main data-testid="home-stub">home-stub</main>,
}));

// Stub Hatch so the router test doesn't drag in wagmi hooks (`useChainId`,
// `useReadContract`, `useWriteContract`) — they require `<WagmiProvider>`
// in context, which this test deliberately omits. The stub receives the
// scrubbed gate-owned handoff props.
//
// `vi.mock` intercepts both static AND dynamic imports of the path, so the
// `lazy(() => import('./routes/Hatch'))` boundary in App.tsx resolves to this stub.
vi.mock('../../src/routes/Hatch', () => {
  const Hatch = ({
    identityHash,
    prngSeed,
  }: {
    identityHash: `0x${string}`;
    prngSeed: number;
  }): JSX.Element => (
    <main
      data-testid="hatch-stub"
      data-identity-hash={identityHash}
      data-prng-seed={String(prngSeed)}
    >
      hatch placeholder
    </main>
  );
  return { Hatch };
});

// Stub HatchLayout so the lazy chunk under `/hatch` doesn't pull in
// `wagmiConfig`, `WagmiProvider`, `RainbowKitProvider`, or the RainbowKit
// modal CSS — none of which are needed for routing assertions and all of
// which require `<WagmiProvider>` setup beyond the scope of this test.
// The stub passes children straight through via `<Outlet />` so the
// inner `<HatchGate>` renders unchanged.
vi.mock('../../src/layouts/HatchLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { default: () => <Outlet /> };
});

// Stub Bond so the routing test doesn't pull in the DotGridBackground
// canvas mount or RouteShell.css. The stub prints a sentinel so router
// wiring is verifiable without rendering the full terminal frame.
vi.mock('../../src/routes/Bond', () => ({
  Bond: (): JSX.Element => <main data-testid="bond-stub">bond-stub</main>,
}));

import App from '../../src/App';

const VALID_IDENTITY_HASH =
  '0x11c1f0ff5f3422e0e9c64abda3c02ca65cb05b5fe768946f7f3f7b89ae3667f6' as const;
const ZERO_IDENTITY_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const VALID_PRNG_SEED = 4_116_242_804;

function hatchFragment({
  identityHash = VALID_IDENTITY_HASH,
  prngSeed = String(VALID_PRNG_SEED),
}: {
  identityHash?: string;
  prngSeed?: string;
} = {}): string {
  return `identityHash=${identityHash}&prngSeed=${prngSeed}`;
}

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routing — routing-collapse contract', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    cleanup();
  });

  it('`/` renders the Home stub', () => {
    renderAt('/');
    expect(screen.getByTestId('home-stub')).toBeTruthy();
  });

  // `/hatch` mounts under a lazy `<HatchLayout>` parent route plus a lazy
  // `<Hatch>` child element.
  // Both lazy boundaries resolve via `vi.mock` synchronously at the module
  // graph level, but `React.lazy` itself always throws a Promise on first
  // render — so the test must `await findByTestId` / `findByText` to let
  // Suspense resolve. Once the lazy module resolves once per test process
  // it stays cached, so subsequent assertions in the same `it` are sync-
  // safe; we only need `findBy` for the first assertion in each lazy path.

  function expectInvalidHandoffWarning(reason: 'missing' | 'malformed'): void {
    expect(warnSpy).toHaveBeenCalledWith(
      '[hatch] invalid handoff, redirecting to /',
      expect.objectContaining({ reason }),
    );
  }

  function expectNoRawHandoffLogged(...rawValues: string[]): void {
    const logged = warnSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    for (const rawValue of rawValues) {
      expect(logged).not.toContain(rawValue);
    }
    expect(logged).not.toContain('raw');
    expect(logged).not.toContain('identityHash');
    expect(logged).not.toContain('prngSeed');
  }

  it('`/hatch` with no fragment redirects to `/` and warns with reason=missing', async () => {
    renderAt('/hatch');
    expect(await screen.findByTestId('home-stub')).toBeTruthy();
    expectInvalidHandoffWarning('missing');
    expectNoRawHandoffLogged();
  });

  it.each([
    ['missing prngSeed', `identityHash=${VALID_IDENTITY_HASH}`],
    ['missing identityHash', `prngSeed=${VALID_PRNG_SEED}`],
    ['empty identityHash', `identityHash=&prngSeed=${VALID_PRNG_SEED}`],
    ['empty prngSeed', `identityHash=${VALID_IDENTITY_HASH}&prngSeed=`],
  ])('`/hatch#%s` redirects to `/` and warns with reason=missing', async (_, fragment) => {
    renderAt(`/hatch#${fragment}`);
    expect(await screen.findByTestId('home-stub')).toBeTruthy();
    expectInvalidHandoffWarning('missing');
    expectNoRawHandoffLogged(fragment);
  });

  it.each([
    ['wrong length', `${VALID_IDENTITY_HASH}0`],
    ['uppercase', VALID_IDENTITY_HASH.toUpperCase()],
    ['zero', ZERO_IDENTITY_HASH],
  ])('malformed identityHash (%s) redirects to `/` without logging raw values', async (_, identityHash) => {
    const fragment = hatchFragment({ identityHash });
    renderAt(`/hatch#${fragment}`);
    expect(await screen.findByTestId('home-stub')).toBeTruthy();
    expectInvalidHandoffWarning('malformed');
    expectNoRawHandoffLogged(identityHash, fragment);
  });

  it.each([
    ['out of range', '4294967296'],
    ['negative', '-1'],
    ['decimal point', '1.5'],
    ['hex-looking', '0x10'],
  ])('malformed prngSeed (%s) redirects to `/` without logging raw values', async (_, prngSeed) => {
    const fragment = hatchFragment({ prngSeed });
    renderAt(`/hatch#${fragment}`);
    expect(await screen.findByTestId('home-stub')).toBeTruthy();
    expectInvalidHandoffWarning('malformed');
    expectNoRawHandoffLogged(prngSeed, fragment);
  });

  it('`/hatch#identityHash=<hash>&prngSeed=<uint32>` stays on the hatch placeholder', async () => {
    renderAt(`/hatch#${hatchFragment()}`);
    const hatch = await screen.findByTestId('hatch-stub');
    expect(hatch.dataset.identityHash).toBe(VALID_IDENTITY_HASH);
    expect(hatch.dataset.prngSeed).toBe(String(VALID_PRNG_SEED));
    expect(screen.queryByTestId('home-stub')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('`prngSeed=0` is accepted', async () => {
    renderAt(`/hatch#${hatchFragment({ prngSeed: '0' })}`);
    const hatch = await screen.findByTestId('hatch-stub');
    expect(hatch.dataset.prngSeed).toBe('0');
    expect(screen.queryByTestId('home-stub')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('unknown path `/garbage` redirects to `/` (catch-all, no warn)', () => {
    renderAt('/garbage');
    expect(screen.getByTestId('home-stub')).toBeTruthy();
    // The catch-all is a pure `<Navigate>`; no telemetry rider lives there.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('`/bond` renders the Bond stub (placeholder route is registered)', () => {
    renderAt('/bond');
    expect(screen.getByTestId('bond-stub')).toBeTruthy();
    expect(screen.queryByTestId('home-stub')).toBeNull();
  });

  it('scrubs the handoff fragment synchronously before the hatch surface mounts', async () => {
    const fragment = hatchFragment();
    window.history.replaceState(null, '', `/hatch#${fragment}`);
    renderAt(`/hatch#${fragment}`);
    expect(await screen.findByTestId('hatch-stub')).toBeTruthy();
    expect(window.location.pathname).toBe('/hatch');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(VALID_IDENTITY_HASH);
    expect(window.location.href).not.toContain(String(VALID_PRNG_SEED));
    expect(window.location.href).not.toContain('prngSeed');
  });
});

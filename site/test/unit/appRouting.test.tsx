// site/test/unit/appRouting.test.tsx
//
// Covers routing behavior documented in docs/site/architecture.md § Routes:
//   - missing/malformed fragment `accountUuid` on `/hatch` redirects to `/`
//   - invalid-param event is emitted before redirect
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
// scrubbed gate-owned UUID prop.
//
// `vi.mock` intercepts both static AND dynamic imports of the path, so the
// `lazy(() => import('./routes/Hatch'))` boundary in App.tsx resolves to this stub.
vi.mock('../../src/routes/Hatch', () => {
  const Hatch = ({ accountUuid }: { accountUuid: string }): JSX.Element => (
    <main data-testid="hatch-stub">hatch placeholder for {accountUuid}</main>
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

  it('`/hatch` with no `accountUuid` param redirects to `/` and warns with reason=missing', async () => {
    renderAt('/hatch');
    expect(await screen.findByTestId('home-stub')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(
      '[hatch] invalid accountUuid, redirecting to /',
      expect.objectContaining({ reason: 'missing', raw: null }),
    );
  });

  it('`/hatch#accountUuid=garbage` redirects to `/` and warns with reason=malformed + truncated raw', async () => {
    renderAt('/hatch#accountUuid=garbage');
    expect(await screen.findByTestId('home-stub')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(
      '[hatch] invalid accountUuid, redirecting to /',
      expect.objectContaining({ reason: 'malformed', raw: 'garbage' }),
    );
  });

  it('`/hatch#accountUuid=<valid-v4>` stays on the hatch placeholder (no redirect)', async () => {
    renderAt('/hatch#accountUuid=f47ac10b-58cc-4372-a567-0e02b2c3d479');
    // The placeholder surface echoes the uuid; assert presence to lock the
    // shape without over-coupling to the placeholder text. `findByText`
    // also serves as the suspense-resolved checkpoint.
    expect(
      await screen.findByText(/hatch placeholder for f47ac10b/i),
    ).toBeTruthy();
    expect(screen.queryByTestId('home-stub')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // Mixed-case `accountUuid` — uppercase UUIDs (hand-constructed dev URLs,
  // address-bar paste) must pass the App-level gate so the route can
  // lowercase + render. See `docs/site/terminal-ui.md` § `/hatch`
  // mixed-case UUID handling. Regression guard against an accidental
  // case-sensitive flag flip on the regex.
  it('`/hatch#accountUuid=<UPPERCASE valid-v4>` stays on the hatch placeholder (case-insensitive regex)', async () => {
    renderAt('/hatch#accountUuid=F47AC10B-58CC-4372-A567-0E02B2C3D479');
    // `findByTestId` waits for the lazy hatch-stub to mount — confirms
    // the route progressed past the gate without redirecting.
    expect(await screen.findByTestId('hatch-stub')).toBeTruthy();
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

  it('truncates an oversized raw `accountUuid` to 64 chars in the telemetry log', async () => {
    const long = 'x'.repeat(200);
    renderAt(`/hatch#accountUuid=${long}`);
    expect(await screen.findByTestId('home-stub')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(
      '[hatch] invalid accountUuid, redirecting to /',
      expect.objectContaining({
        reason: 'malformed',
        raw: 'x'.repeat(64),
      }),
    );
  });

  it('scrubs the UUID fragment synchronously before the hatch surface mounts', async () => {
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    window.history.replaceState(null, '', `/hatch#accountUuid=${uuid}`);
    renderAt(`/hatch#accountUuid=${uuid}`);
    expect(await screen.findByTestId('hatch-stub')).toBeTruthy();
    expect(window.location.pathname).toBe('/hatch');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(uuid);
  });
});

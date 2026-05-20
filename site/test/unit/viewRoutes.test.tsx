// site/test/unit/viewRoutes.test.tsx
//
// Covers `/view` and `/view/<uuid>`. The data layer now is
// `useBuddyLookup` (TanStack Query wrapper around viem `publicClient`), NOT
// wagmi — no `WagmiProvider` is in scope on `/view`, and the test does not
// need to mock wagmi or `chains.ts` at all.
//
// Mock surface: `useBuddyLookup` returns the tagged-union shape directly.
// Per-test setting of the next return value drives every branch:
//
//   { status: 'loading' }                                  → loading copy
//   { status: 'error', kind: 'tokenId',  error }            → lookup-failed
//   { status: 'error', kind: 'tokenUri', error }            → metadata-failed
//   { status: 'success', data: { state: 'pre-deploy' } }   → pre-deploy warn
//   { status: 'success', data: { state: 'miss' } }         → miss-card
//   { status: 'success', data: { state: 'hit', svg } }      → happy path
//
// Identity-hash lowercasing assertion is covered by the existing uppercase-
// UUID test plus a new direct-hash unit test against `useBuddyLookup`'s
// internal contract — see the `lowercases` describe block below.
//
// The on-chain SVG is the full card. The route no longer decodes metadata
// into local trait/stat chrome.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// ── Mocks ────────────────────────────────────────────────────────────────

// Stub Home — rendered by the `<Navigate to="/" />` redirect on bad UUID.
vi.mock('../../src/routes/Home', () => ({
  Home: (): JSX.Element => <main data-testid="home-stub">home-stub</main>,
}));

// Mock `useBuddyLookup`. Each test sets `useBuddyLookupMock.mockReturnValue`
// to the desired tagged-union state. The mock is type-loose (`any`) at
// the boundary because vitest's `vi.fn` typing on tagged unions is brittle;
// the production `useBuddyLookup` types are tested transitively by the
// route's TS checker on every build.
const useBuddyLookupMock = vi.fn();
vi.mock('../../src/lib/useBuddyLookup', () => ({
  useBuddyLookup: (...args: unknown[]) => useBuddyLookupMock(...args),
}));

// `ACTIVE_NETWORK` is a build-time constant the route reads to feed the
// hook's chainId argument. The default 'local' (chainId 31337) is fine for
// the tests; we just need the import to resolve. Mocking would be over-
// engineering — it's a pure constant.

// Import route components AFTER mocks so the hooks resolve to stubs.
import { View } from '../../src/routes/View';
import { ViewUuid } from '../../src/routes/ViewUuid';

// ── Helpers ──────────────────────────────────────────────────────────────

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function buildHitFixture(svgMarkup: string) {
  return {
    state: 'hit' as const,
    svg: svgMarkup,
  };
}

function renderViewAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<main data-testid="home-stub">home-stub</main>} />
        <Route path="/view" element={<View />} />
        <Route path="/view/:uuid" element={<ViewUuid />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('/view (bare lookup)', () => {
  beforeEach(() => {
    useBuddyLookupMock.mockReset();
    useBuddyLookupMock.mockReturnValue({ status: 'loading' });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the STATUS line per docs/site/terminal-ui.md § `/view` bare lookup', () => {
    renderViewAt('/view');
    expect(screen.getByText('no id supplied')).toBeTruthy();
    expect(
      screen.getByText('enter an account UUID to view a buddy'),
    ).toBeTruthy();
  });

  it('renders the action-prompt input shaped like terminal text (no separate [View buddy] button)', () => {
    renderViewAt('/view');
    // Input still labelled `account-uuid` for screen readers via the
    // visually-hidden label. Action prompt collapses the LOOKUP form +
    // bracketed button into a single inline-text-styled input per
    // `docs/site/terminal-ui.md` § `/view` bare lookup.
    expect(screen.getByLabelText('account-uuid')).toBeTruthy();
    // The bracketed `[View buddy]` button is gone — submit happens on
    // Enter inside the input.
    expect(
      screen.queryByRole('button', { name: /\[View buddy\]/ }),
    ).toBeNull();
  });

  it('shows the invalid-uuid warning while a non-empty invalid value is typed', () => {
    renderViewAt('/view');
    fireEvent.change(screen.getByLabelText('account-uuid'), {
      target: { value: 'garbage' },
    });
    expect(screen.getByText('! enter a valid account uuid')).toBeTruthy();
  });

  it('row click with empty input renders the error line (no navigation)', () => {
    function LocationProbe(): JSX.Element {
      const loc = useLocation();
      return <span data-testid="location">{loc.pathname}</span>;
    }
    render(
      <MemoryRouter initialEntries={['/view']}>
        <Routes>
          <Route
            path="/view"
            element={
              <>
                <LocationProbe />
                <View />
              </>
            }
          />
          <Route
            path="/view/:uuid"
            element={<main data-testid="navigated">navigated</main>}
          />
        </Routes>
      </MemoryRouter>,
    );
    const row = document.querySelector('.view-action') as HTMLDivElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);
    // Error visible; no navigation happened.
    expect(screen.getByText('! enter a valid account uuid')).toBeTruthy();
    expect(screen.queryByTestId('navigated')).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/view');
  });

  it('row click with invalid input renders the error line (no navigation)', () => {
    function LocationProbe(): JSX.Element {
      const loc = useLocation();
      return <span data-testid="location">{loc.pathname}</span>;
    }
    render(
      <MemoryRouter initialEntries={['/view']}>
        <Routes>
          <Route
            path="/view"
            element={
              <>
                <LocationProbe />
                <View />
              </>
            }
          />
          <Route
            path="/view/:uuid"
            element={<main data-testid="navigated">navigated</main>}
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('account-uuid'), {
      target: { value: 'garbage' },
    });
    const row = document.querySelector('.view-action') as HTMLDivElement;
    fireEvent.click(row);
    expect(screen.getByText('! enter a valid account uuid')).toBeTruthy();
    expect(screen.queryByTestId('navigated')).toBeNull();
    expect(screen.getByTestId('location').textContent).toBe('/view');
  });

  it('repeat row click with invalid input remounts the warn line (replay)', () => {
    render(
      <MemoryRouter initialEntries={['/view']}>
        <Routes>
          <Route path="/view" element={<View />} />
          <Route
            path="/view/:uuid"
            element={<main data-testid="navigated">navigated</main>}
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('account-uuid'), {
      target: { value: 'garbage' },
    });
    const row = document.querySelector('.view-action') as HTMLDivElement;
    fireEvent.click(row);
    const before = document.querySelector('.view-action__warn');
    expect(before).toBeTruthy();
    fireEvent.click(row);
    const after = document.querySelector('.view-action__warn');
    // React `key={errorKey}` change unmounts + remounts the warn <p> —
    // DOM identity is the cheapest assertion that the CSS fade-in
    // animation will replay (mirrors homeRoute replayKey idiom).
    expect(after).not.toBe(before);
  });

  it('row click with valid input navigates to /view/<uuid>', () => {
    function LocationProbe(): JSX.Element {
      const loc = useLocation();
      return <span data-testid="location">{loc.pathname}</span>;
    }
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: { state: 'pre-deploy' as const },
    });
    render(
      <MemoryRouter initialEntries={['/view']}>
        <Routes>
          <Route path="/view" element={<View />} />
          <Route
            path="/view/:uuid"
            element={
              <>
                <LocationProbe />
                <ViewUuid />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('account-uuid'), {
      target: { value: VALID_UUID },
    });
    const row = document.querySelector('.view-action') as HTMLDivElement;
    fireEvent.click(row);
    expect(screen.getByTestId('location').textContent).toBe(
      `/view/${VALID_UUID}`,
    );
  });

  it('navigates to /view/<lowercase-uuid> on valid Enter submit', () => {
    function LocationProbe(): JSX.Element {
      const loc = useLocation();
      return <span data-testid="location">{loc.pathname}</span>;
    }
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: { state: 'pre-deploy' as const },
    });
    render(
      <MemoryRouter initialEntries={['/view']}>
        <Routes>
          <Route path="/view" element={<View />} />
          <Route
            path="/view/:uuid"
            element={
              <>
                <LocationProbe />
                <ViewUuid />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText('account-uuid'), {
      target: { value: '  F47AC10B-58CC-4372-A567-0E02B2C3D479  ' },
    });
    // Enter submits the form — the input lives inside `<form
    // class="view-action-form">`. Use the form-submit shortcut to
    // simulate the Enter keypress.
    fireEvent.submit(screen.getByLabelText('account-uuid').closest('form')!);
    expect(screen.getByTestId('location').textContent).toBe(
      `/view/${VALID_UUID}`,
    );
  });

  it('renders the brand-wordmark terminal title', () => {
    renderViewAt('/view');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'BUDDIES·ONCHAIN·XYZ',
    );
  });

  it('echoes `> /view --help` per docs/site/terminal-ui.md § Routes and command echoes', () => {
    renderViewAt('/view');
    const echo = document.querySelector('.route-command__accent');
    expect(echo?.textContent).toBe('/view --help');
  });

  it('does NOT render the tail terminal prompt cursor (action prompt owns cursor slot)', () => {
    renderViewAt('/view');
    expect(document.querySelector('.terminal-frame__prompt')).toBeNull();
  });

  it('renders the separator rail above AUTHOR per cold-shape parity', () => {
    renderViewAt('/view');
    const rail = document.querySelector('.route-rail');
    expect(rail).toBeTruthy();
    expect((rail!.textContent ?? '').trim()).toMatch(/^-+$/);
  });

  it('SEE ALSO row order is /hatch → /bond → github → contract (bare /view self-omits)', () => {
    renderViewAt('/view');
    const seeAlso = document.querySelector('.see-also');
    const labels = Array.from(seeAlso!.querySelectorAll('.see-also__label')).map(
      (c) => c.textContent?.trim() ?? '',
    );
    expect(labels[0]).toBe('/hatch');
    expect(labels[1]).toBe('/bond');
    expect(labels[2]).toBe('github');
    expect(labels).not.toContain('/view');
  });

  it('SEE ALSO uses cold-shape parity (`PilsnerChamp/buddies-onchain`, plain `stage 2` — no `not yet implemented` warn tail)', () => {
    renderViewAt('/view');
    const seeAlso = document.querySelector('.see-also');
    const text = (seeAlso!.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('PilsnerChamp/buddies-onchain');
    expect(text).not.toContain('source · manifesto · contracts');
    expect(text).not.toContain('not yet implemented');
  });
});

describe('/view/<uuid> — UUID shape gate', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useBuddyLookupMock.mockReset();
    useBuddyLookupMock.mockReturnValue({ status: 'loading' });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    cleanup();
  });

  it('redirects to / and warns when the path uuid is malformed', () => {
    renderViewAt('/view/garbage');
    expect(screen.getByTestId('home-stub')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(
      '[view] invalid uuid, redirecting to /',
      expect.objectContaining({ reason: 'malformed', raw: 'garbage' }),
    );
  });

  it('truncates an oversized raw uuid to 64 chars in the telemetry log', () => {
    const long = 'x'.repeat(200);
    renderViewAt(`/view/${long}`);
    expect(warnSpy).toHaveBeenCalledWith(
      '[view] invalid uuid, redirecting to /',
      expect.objectContaining({
        reason: 'malformed',
        raw: 'x'.repeat(64),
      }),
    );
  });

  it('accepts uppercase v4 UUID (case-insensitive regex) — does NOT redirect', () => {
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: { state: 'pre-deploy' as const },
    });
    renderViewAt('/view/F47AC10B-58CC-4372-A567-0E02B2C3D479');
    // Not redirected to / — the surface should render the pre-deploy
    // terminal warning per the mocked hook return.
    expect(screen.queryByTestId('home-stub')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('lowercases the uuid before passing to useBuddyLookup (identity-hash parity)', () => {
    // Identity hashing is contract-mandated lowercase. The route gate
    // lowercases the path param BEFORE calling the hook so the hook's
    // `keccak256(toBytes(uuid))` matches the contract's
    // `keccak256(bytes(accountUuid))` exactly.
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: { state: 'pre-deploy' as const },
    });
    renderViewAt('/view/F47AC10B-58CC-4372-A567-0E02B2C3D479');
    expect(useBuddyLookupMock).toHaveBeenCalledWith(VALID_UUID, expect.any(Number));
    // Ensure the lowercase form (not the uppercase path) is the first arg.
    const firstCallArg = useBuddyLookupMock.mock.calls[0]?.[0];
    expect(firstCallArg).toBe(VALID_UUID);
    expect(firstCallArg).not.toBe('F47AC10B-58CC-4372-A567-0E02B2C3D479');
  });
});

describe('/view/<uuid> — loading', () => {
  beforeEach(() => {
    useBuddyLookupMock.mockReset();
    useBuddyLookupMock.mockReturnValue({ status: 'loading' });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the minimal "looking up buddy…" terminal copy', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    expect(screen.getByText('looking up buddy…')).toBeTruthy();
  });
});

describe('/view/<uuid> — error states', () => {
  beforeEach(() => {
    useBuddyLookupMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('tokenId-kind error renders the lookup-failed warn line', () => {
    useBuddyLookupMock.mockReturnValue({
      status: 'error',
      error: new Error('rpc down'),
      kind: 'tokenId',
    });
    renderViewAt(`/view/${VALID_UUID}`);
    expect(screen.getByText('! lookup failed — try refreshing the page')).toBeTruthy();
  });

  it('tokenUri-kind error renders the metadata-failed warn line', () => {
    useBuddyLookupMock.mockReturnValue({
      status: 'error',
      error: new Error('decode failed'),
      kind: 'tokenUri',
    });
    renderViewAt(`/view/${VALID_UUID}`);
    expect(
      screen.getByText('! could not load buddy metadata — try refreshing the page'),
    ).toBeTruthy();
  });
});

describe('/view/<uuid> — pre-deploy', () => {
  beforeEach(() => {
    useBuddyLookupMock.mockReset();
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: { state: 'pre-deploy' as const },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the pre-deploy warning', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    expect(
      screen.getByText('! Buddies Onchain is not yet deployed on this network'),
    ).toBeTruthy();
  });
});

describe('/view/<uuid> — deployed miss', () => {
  beforeEach(() => {
    useBuddyLookupMock.mockReset();
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' as const },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the miss man-page composition per docs/site/terminal-ui.md § `/view/<uuid>` miss card', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    expect(screen.getByText('not found')).toBeTruthy();
    expect(
      screen.getByText('no buddy for this UUID on this network'),
    ).toBeTruthy();
    expect(screen.getByText(/The UUID is valid/)).toBeTruthy();
    // NEXT STEPS prose mirrors the miss-state visual layout
    // — `If this is your account, install the buddy-onchain plugin.`
    // + `Otherwise, check the UUID or try another lookup.`
    expect(
      screen.getByText(/install the buddy-onchain plugin/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Otherwise, check the UUID or try another lookup/),
    ).toBeTruthy();
  });

  it('echoes the full UUID in the command header (terminal-verbatim, no truncation)', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    expect(screen.getByText(VALID_UUID)).toBeTruthy();
  });

  it('echoes `> /view <uuid>` (no `--help` form — UUID IS the command arg)', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    const echo = document.querySelector('.route-command__accent');
    expect(echo?.textContent).toBe('/view');
  });

  it('miss card carries an action-prompt slot after NEXT STEPS; tail cursor suppressed (action prompt owns cursor slot)', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    // Action prompt input present in the miss-state visual layout —
    // miss card mirrors bare /view's lookup affordance so
    // the user can re-engage without navigating back.
    expect(document.querySelector('.view-action')).toBeTruthy();
    expect(screen.getByLabelText('account-uuid')).toBeTruthy();
    // Tail `> ▊` cursor suppressed — two blinking cursors fighting
    // for attention reads as visual noise; the action prompt is the
    // only cursor on the miss card.
    expect(document.querySelector('.terminal-frame__prompt')).toBeNull();
  });

  it('renders the separator rail above AUTHOR on the miss card', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    const rail = document.querySelector('.route-rail');
    expect(rail).toBeTruthy();
    expect((rail!.textContent ?? '').trim()).toMatch(/^-+$/);
  });

  it('miss SEE ALSO order is / → /view → /bond → github → contract (no /hatch — hatch starts from plugin handoff)', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    const seeAlso = document.querySelector('.see-also');
    const labels = Array.from(seeAlso!.querySelectorAll('.see-also__label')).map(
      (c) => c.textContent?.trim() ?? '',
    );
    expect(labels[0]).toBe('/');
    expect(labels[1]).toBe('/view');
    expect(labels[2]).toBe('/bond');
    expect(labels[3]).toBe('github');
    // /hatch intentionally absent on miss card — see
    // `docs/site/terminal-ui.md` § SEE ALSO row pattern (per-route
    // row order).
    expect(labels).not.toContain('/hatch');
  });
});

describe('/view/<uuid> — happy path SVG render', () => {
  beforeEach(() => {
    useBuddyLookupMock.mockReset();
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: buildHitFixture(
        '<svg xmlns="http://www.w3.org/2000/svg"><text>COMMON DUCK HATCHED</text><rect/></svg>',
      ),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render legacy decoded header-label chrome', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/view/${VALID_UUID}`]}>
        <Routes>
          <Route path="/view/:uuid" element={<ViewUuid />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('.view-uuid__label')).toHaveLength(0);
  });

  it('lets the on-chain SVG own trait text instead of reordering metadata', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/view/${VALID_UUID}`]}>
        <Routes>
          <Route path="/view/:uuid" element={<ViewUuid />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('.view-uuid__buddy svg')).toBeTruthy();
    expect(container.querySelector('.view-uuid__buddy')?.textContent).toContain(
      'COMMON DUCK HATCHED',
    );
  });

  it('does not render legacy decoded stat-row chrome', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/view/${VALID_UUID}`]}>
        <Routes>
          <Route path="/view/:uuid" element={<ViewUuid />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('.view-uuid__stat-value')).toHaveLength(0);
  });

  it('renders the buddy SVG via dangerouslySetInnerHTML', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/view/${VALID_UUID}`]}>
        <Routes>
          <Route path="/view/:uuid" element={<ViewUuid />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('does NOT render the tail terminal prompt cursor (read-only NFT card)', () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`/view/${VALID_UUID}`]}>
        <Routes>
          <Route path="/view/:uuid" element={<ViewUuid />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector('.terminal-frame__prompt')).toBeNull();
  });
});

describe('/view/<uuid> — SVG-only hit payload', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders when the hit payload only contains SVG', () => {
    useBuddyLookupMock.mockReset();
    useBuddyLookupMock.mockReturnValue({
      status: 'success',
      data: buildHitFixture(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>',
      ),
    });

    const { container } = render(
      <MemoryRouter initialEntries={[`/view/${VALID_UUID}`]}>
        <Routes>
          <Route path="/view/:uuid" element={<ViewUuid />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('.view-uuid__buddy svg circle')).toBeTruthy();
    expect(container.querySelectorAll('.view-uuid__label')).toHaveLength(0);
    expect(container.querySelectorAll('.view-uuid__stat-value')).toHaveLength(0);
  });

});

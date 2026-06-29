// site/test/unit/viewRoutes.test.tsx
//
// Covers hash-only route mechanics for `/view`:
//   - manual `/view` keeps UUID in component state, resolves it to tokenId,
//     then navigates to `/view/<tokenId>` with no UUID in the URL
//   - `/view/:tokenId` reads tokenURI(tokenId) directly
//   - UUID-shaped path segments are not a route anymore; they render NotFound

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';

const useBuddyLookupMock = vi.fn();
const useBuddyTokenMock = vi.fn();

vi.mock('../../src/lib/useBuddyLookup', () => ({
  useBuddyLookup: (...args: unknown[]) => useBuddyLookupMock(...args),
  useBuddyToken: (...args: unknown[]) => useBuddyTokenMock(...args),
}));

import { View } from '../../src/routes/View';
import { ViewToken } from '../../src/routes/ViewToken';

const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function LocationProbe(): JSX.Element {
  const loc = useLocation();
  const state = loc.state === null ? 'null' : JSON.stringify(loc.state);
  return (
    <span
      data-testid="location"
      data-location-key={loc.key}
      data-location-state={state}
    >
      {`${loc.pathname}${loc.search}${loc.hash}`}
    </span>
  );
}

function TokenStub(): JSX.Element {
  const params = useParams<{ tokenId: string }>();
  return <main data-testid="token-stub">token {params.tokenId}</main>;
}

function renderViewAt(path: string): void {
  renderWithClient(
    <MemoryRouter initialEntries={[path]}>
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
        <Route path="/view/:tokenId" element={<ViewToken />} />
      </Routes>
    </MemoryRouter>,
  );
}

type RouteEntry = string | { pathname: string; state?: unknown };

function renderBareViewWithTokenStub({
  withLocationProbe = false,
}: {
  withLocationProbe?: boolean;
} = {}): ReturnType<typeof renderWithClient> {
  const viewElement = withLocationProbe ? (
    <>
      <LocationProbe />
      <View />
    </>
  ) : (
    <View />
  );

  return renderWithClient(
    <MemoryRouter initialEntries={['/view']}>
      <Routes>
        <Route path="/view" element={viewElement} />
        <Route path="/view/:tokenId" element={<TokenStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderBareViewWithTokenPage(): ReturnType<typeof renderWithClient> {
  return renderWithClient(
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
          path="/view/:tokenId"
          element={
            <>
              <LocationProbe />
              <ViewToken />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function tokenRouteWithProbe(entry: RouteEntry): JSX.Element {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/view/:tokenId"
          element={
            <>
              <LocationProbe />
              <ViewToken />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function renderTokenRouteWithProbe(
  entry: RouteEntry,
  queryClient?: QueryClient,
): ReturnType<typeof renderWithClient> {
  return renderWithClient(tokenRouteWithProbe(entry), queryClient);
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithClient(
  ui: JSX.Element,
  queryClient = createTestQueryClient(),
): ReturnType<typeof render> {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const INPUT_LABEL = 'token-id or account-uuid';

function submitLookup(value: string): void {
  fireEvent.change(screen.getByLabelText(INPUT_LABEL), {
    target: { value },
  });
  fireEvent.submit(screen.getByLabelText(INPUT_LABEL).closest('form')!);
}

describe('/view manual lookup', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    document.head.innerHTML = '';
    useBuddyLookupMock.mockReset();
    useBuddyTokenMock.mockReset();
    useBuddyLookupMock.mockImplementation((uuid: string | null) =>
      uuid === null ? { status: 'idle' } : { status: 'loading' },
    );
  });

  afterEach(cleanup);

  it('renders the dual-grammar lookup prompt and marks the page noindex', () => {
    renderViewAt('/view');
    expect(screen.getByText('no id supplied')).toBeTruthy();
    expect(screen.getByText('enter a token id or account UUID')).toBeTruthy();
    expect(screen.getByLabelText(INPUT_LABEL)).toBeTruthy();
    expect(screen.getByPlaceholderText('<token-id> | <account-uuid>')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, follow',
    );
  });

  it('shows the invalid-input warning while a non-empty invalid value is typed', () => {
    renderViewAt('/view');
    fireEvent.change(screen.getByLabelText(INPUT_LABEL), {
      target: { value: 'garbage' },
    });
    expect(screen.getByText('! enter a valid token id or account uuid')).toBeTruthy();
  });

  it('marks empty submits invalid until the user enters a valid value', () => {
    renderViewAt('/view');
    const input = screen.getByLabelText(INPUT_LABEL);

    expect(input.getAttribute('aria-invalid')).toBe('false');

    fireEvent.submit(input.closest('form')!);

    expect(screen.getByText('! enter a valid token id or account uuid')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: '42' } });

    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('digit input navigates straight to /view/<tokenId> with no contract read', async () => {
    renderBareViewWithTokenStub();

    submitLookup('42');

    expect((await screen.findByTestId('token-stub')).textContent).toBe('token 42');
    expect(useBuddyLookupMock.mock.calls.some(([uuid]) => uuid !== null)).toBe(false);
  });

  it('bare token-id submit landing on a miss mounts without the retry warn', async () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });
    renderBareViewWithTokenPage();

    submitLookup('42');

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/view/42');
    });
    expect(
      screen.queryByText('! not found — try a different token id'),
    ).toBeNull();
    expect(screen.getByTestId('location').getAttribute('data-location-state')).toBe(
      'null',
    );
  });

  it('valid input resolves UUID in state and navigates to /view/<tokenId>', async () => {
    useBuddyLookupMock.mockImplementation((uuid: string | null) => {
      if (uuid === null) return { status: 'idle' };
      return { status: 'success', data: { state: 'hit', tokenId: 42n } };
    });
    renderBareViewWithTokenStub({ withLocationProbe: true });

    submitLookup(VALID_UUID);

    expect((await screen.findByTestId('token-stub')).textContent).toBe('token 42');
    expect(screen.queryByTestId('location')).toBeNull();
  });

  it('lookup miss stays on /view and never writes the UUID into the URL', () => {
    useBuddyLookupMock.mockImplementation((uuid: string | null) => {
      if (uuid === null) return { status: 'idle' };
      return { status: 'success', data: { state: 'miss' } };
    });
    renderViewAt('/view');

    submitLookup(VALID_UUID);

    expect(screen.getByText('! no buddy found for that UUID on this network')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/view');
  });

  it('identical UUID resubmit remounts the async feedback line', () => {
    useBuddyLookupMock.mockImplementation((uuid: string | null) => {
      if (uuid === null) return { status: 'idle' };
      return { status: 'success', data: { state: 'miss' } };
    });
    renderViewAt('/view');

    submitLookup(VALID_UUID);
    const firstFeedback = screen.getByText(
      '! no buddy found for that UUID on this network',
    );

    fireEvent.submit(screen.getByLabelText(INPUT_LABEL).closest('form')!);

    const secondFeedback = screen.getByText(
      '! no buddy found for that UUID on this network',
    );
    expect(secondFeedback).not.toBe(firstFeedback);
    expect(secondFeedback.className).toContain('view-uuid__feedback');
  });
});

describe('/view/<tokenId> token page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    document.head.innerHTML = '';
    useBuddyLookupMock.mockReset();
    useBuddyTokenMock.mockReset();
    useBuddyTokenMock.mockReturnValue({ status: 'loading' });
    // The miss state mounts the unified console, which wires the UUID
    // lookup hook; default to idle/loading.
    useBuddyLookupMock.mockImplementation((uuid: string | null) =>
      uuid === null ? { status: 'idle' } : { status: 'loading' },
    );
  });

  afterEach(cleanup);

  it('rejects non-numeric token ids with NotFound, not a home redirect', () => {
    renderViewAt('/view/garbage');
    expect(screen.getByText('! not found — token id must be a positive integer within uint256')).toBeTruthy();
  });

  it('rejects token ids beyond uint256 as invalid, not a miss', () => {
    renderViewAt(`/view/${(1n << 256n).toString()}`);
    expect(screen.getByText('! not found — token id must be a positive integer within uint256')).toBeTruthy();
    expect(useBuddyTokenMock).not.toHaveBeenCalled();
  });

  it('rejects UUID-shaped path segments; /view/:uuid is gone', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    expect(screen.getByText('! not found — token id must be a positive integer within uint256')).toBeTruthy();
    expect(useBuddyLookupMock).not.toHaveBeenCalled();
    expect(useBuddyTokenMock).not.toHaveBeenCalled();
  });

  it('loads tokenURI directly by tokenId', () => {
    renderViewAt('/view/42');
    expect(useBuddyTokenMock).toHaveBeenCalledWith(42n, expect.any(Number));
    expect(screen.getByText('loading buddy #42…')).toBeTruthy();
  });

  it('renders token metadata errors', () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'error',
      kind: 'tokenUri',
      error: new Error('boom'),
    });
    renderViewAt('/view/42');
    expect(
      screen.getByText('! could not load buddy metadata — try refreshing the page'),
    ).toBeTruthy();
  });

  it('renders pre-deploy state', () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'pre-deploy' },
    });
    renderViewAt('/view/42');
    expect(
      screen.getByText('! Buddies Onchain is not yet deployed on this network'),
    ).toBeTruthy();
  });

  it('renders the miss card for a nonexistent token — not the generic error', () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });
    renderViewAt('/view/999');

    expect(screen.getByText('not found')).toBeTruthy();
    expect(
      screen.getByText('no buddy for this token on this network'),
    ).toBeTruthy();
    // The unified dual-grammar console mounts on the miss state — same
    // prompt as bare /view.
    expect(screen.getByLabelText(INPUT_LABEL)).toBeTruthy();
    expect(document.body.textContent).not.toContain('Looking for your own buddy?');
    expect(document.body.textContent).toContain(
      'try another token id or account UUID below',
    );
    // Deterministic miss never shows the transient-failure copy.
    expect(
      screen.queryByText('! could not load buddy metadata — try refreshing the page'),
    ).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, follow',
    );
  });

  it('miss-card retry navigates to the entered token id', async () => {
    useBuddyTokenMock.mockImplementation((tokenId: bigint) =>
      tokenId === 999n
        ? { status: 'success', data: { state: 'miss' } }
        : { status: 'loading' },
    );
    renderTokenRouteWithProbe('/view/999');

    submitLookup('42');

    expect((await screen.findByTestId('location')).textContent).toBe('/view/42');
  });

  it('miss-card retry rejects an invalid value inline', () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });
    renderViewAt('/view/999');

    submitLookup('abc');

    expect(screen.getByText('! enter a valid token id or account uuid')).toBeTruthy();
  });

  it('miss-card UUID entry resolves and navigates to the found token', async () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });
    useBuddyLookupMock.mockImplementation((uuid: string | null) => {
      if (uuid === null) return { status: 'idle' };
      return { status: 'success', data: { state: 'hit', tokenId: 1n } };
    });
    renderTokenRouteWithProbe('/view/999');

    submitLookup(VALID_UUID);

    expect((await screen.findByTestId('location')).textContent).toBe('/view/1');
  });

  it('miss-card UUID hit for the same token invalidates instead of navigating', async () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });
    useBuddyLookupMock.mockImplementation((uuid: string | null) => {
      if (uuid === null) return { status: 'idle' };
      return { status: 'success', data: { state: 'hit', tokenId: 999n } };
    });
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const routeTree = (): JSX.Element => tokenRouteWithProbe('/view/999');
    const { rerender } = renderWithClient(routeTree(), queryClient);
    const initialLocationKey = screen
      .getByTestId('location')
      .getAttribute('data-location-key');

    submitLookup(VALID_UUID);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['buddy-token', expect.any(Number), '999'],
    });
    expect(screen.getByTestId('location').textContent).toBe('/view/999');
    expect(screen.getByTestId('location').getAttribute('data-location-key')).toBe(
      initialLocationKey,
    );

    rerender(<QueryClientProvider client={queryClient}>{routeTree()}</QueryClientProvider>);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('re-submitting the current missed id warns in place without navigating', () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });
    renderTokenRouteWithProbe('/view/999');

    submitLookup('999');

    expect(
      screen.getByText('! not found — try a different token id'),
    ).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/view/999');
  });

  it('a retry that lands on another miss mounts with the not-found warn', async () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });
    renderTokenRouteWithProbe('/view/999');

    // No warn on the directly-visited miss card.
    expect(
      screen.queryByText('! not found — try a different token id'),
    ).toBeNull();

    submitLookup('4');

    expect((await screen.findByTestId('location')).textContent).toBe('/view/4');
    expect(
      screen.getByText('! not found — try a different token id'),
    ).toBeTruthy();

    // Typing clears the sticky warn — the user is acting on it.
    fireEvent.change(screen.getByLabelText(INPUT_LABEL), {
      target: { value: '5' },
    });
    expect(
      screen.queryByText('! not found — try a different token id'),
    ).toBeNull();
  });

  it('consumes retriedMiss state after mounting the retry warn', async () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: { state: 'miss' },
    });

    renderTokenRouteWithProbe({
      pathname: '/view/4',
      state: { retriedMiss: true },
    });

    expect(
      screen.getByText('! not found — try a different token id'),
    ).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('location').getAttribute('data-location-state')).toBe(
        'null',
      );
    });
    expect(
      screen.getByText('! not found — try a different token id'),
    ).toBeTruthy();

    cleanup();
    renderTokenRouteWithProbe('/view/4');

    expect(
      screen.queryByText('! not found — try a different token id'),
    ).toBeNull();
  });

  it('renders the buddy SVG and sets canonical/OG to tokenId form', () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: {
        state: 'hit',
        svg: '<svg><text>buddy #42</text></svg>',
      },
    });
    renderViewAt('/view/42');

    expect(screen.getByRole('img', { name: 'buddy' }).innerHTML).toContain(
      'buddy #42',
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://buddies-onchain.xyz/view/42',
    );
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://buddies-onchain.xyz/view/42',
    );
  });

  it('renders no titlebar trust icons on the card in local env (both URLs null → spacer kept)', () => {
    useBuddyTokenMock.mockReturnValue({
      status: 'success',
      data: {
        state: 'hit',
        svg: '<svg><text>buddy #7</text></svg>',
      },
    });
    renderViewAt('/view/7');

    // The card has no SEE ALSO footer — trust links ride the titlebar's right
    // column instead. Test env resolves to `local` (chainId 31337): no OpenSea
    // surface AND no explorer base, so both icons resolve null and the header
    // keeps its centering spacer. Mainnet rendering is covered by
    // titlebarTrustIcons.test.tsx against 8453.json.
    expect(document.querySelector('.terminal-frame__actions')).toBeNull();
    expect(document.querySelector('.terminal-frame__spacer')).toBeTruthy();
    expect(screen.queryByLabelText('View this buddy on OpenSea')).toBeNull();
  });
});

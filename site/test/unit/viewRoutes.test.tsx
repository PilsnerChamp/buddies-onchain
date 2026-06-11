// site/test/unit/viewRoutes.test.tsx
//
// Covers hash-only route mechanics for `/view`:
//   - manual `/view` keeps UUID in component state, resolves it to tokenId,
//     then navigates to `/view/<tokenId>` with no UUID in the URL
//   - `/view/:tokenId` reads tokenURI(tokenId) directly
//   - UUID-shaped path segments are not a route anymore; they render NotFound

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  return <span data-testid="location">{`${loc.pathname}${loc.search}${loc.hash}`}</span>;
}

function TokenStub(): JSX.Element {
  const params = useParams<{ tokenId: string }>();
  return <main data-testid="token-stub">token {params.tokenId}</main>;
}

function renderViewAt(path: string): void {
  render(
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

function submitUuid(uuid = VALID_UUID): void {
  fireEvent.change(screen.getByLabelText('account-uuid'), {
    target: { value: uuid },
  });
  fireEvent.submit(screen.getByLabelText('account-uuid').closest('form')!);
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

  it('renders the manual lookup prompt and marks the page noindex', () => {
    renderViewAt('/view');
    expect(screen.getByText('no id supplied')).toBeTruthy();
    expect(screen.getByLabelText('account-uuid')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, follow',
    );
  });

  it('shows the invalid-uuid warning while a non-empty invalid value is typed', () => {
    renderViewAt('/view');
    fireEvent.change(screen.getByLabelText('account-uuid'), {
      target: { value: 'garbage' },
    });
    expect(screen.getByText('! enter a valid account uuid')).toBeTruthy();
  });

  it('valid input resolves UUID in state and navigates to /view/<tokenId>', async () => {
    useBuddyLookupMock.mockImplementation((uuid: string | null) => {
      if (uuid === null) return { status: 'idle' };
      return { status: 'success', data: { state: 'hit', tokenId: 42n } };
    });
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
          <Route path="/view/:tokenId" element={<TokenStub />} />
        </Routes>
      </MemoryRouter>,
    );

    submitUuid();

    expect((await screen.findByTestId('token-stub')).textContent).toBe('token 42');
    expect(screen.queryByTestId('location')).toBeNull();
    expect(window.location.href).not.toContain(VALID_UUID);
  });

  it('lookup miss stays on /view and never writes the UUID into the URL', () => {
    useBuddyLookupMock.mockImplementation((uuid: string | null) => {
      if (uuid === null) return { status: 'idle' };
      return { status: 'success', data: { state: 'miss' } };
    });
    renderViewAt('/view');

    submitUuid();

    expect(screen.getByText('! no buddy found for that UUID on this network')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/view');
    expect(window.location.href).not.toContain(VALID_UUID);
  });
});

describe('/view/<tokenId> token page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    document.head.innerHTML = '';
    useBuddyLookupMock.mockReset();
    useBuddyTokenMock.mockReset();
    useBuddyTokenMock.mockReturnValue({ status: 'loading' });
  });

  afterEach(cleanup);

  it('rejects non-numeric token ids with NotFound, not a home redirect', () => {
    renderViewAt('/view/garbage');
    expect(screen.getByText('! not found — token id must be a positive number')).toBeTruthy();
  });

  it('rejects UUID-shaped path segments; /view/:uuid is gone', () => {
    renderViewAt(`/view/${VALID_UUID}`);
    expect(screen.getByText('! not found — token id must be a positive number')).toBeTruthy();
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
});

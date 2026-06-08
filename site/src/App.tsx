import { lazy, Suspense, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './routes/Home';
import { Bond } from './routes/Bond';
import { View } from './routes/View';
import { ViewToken } from './routes/ViewToken';
import { isValidUuid } from '~shared/isValidUuid';
import { useArrowRowNav } from './lib/useArrowRowNav';
import { ROUTES } from './config/routes';

// URL map:
//   `/`              → `<Home />`
//   `/hatch`         → execution surface; reads `accountUuid` from the URL
//                      fragment, validates it, synchronously scrubs the URL,
//                      then passes the UUID as a prop. Missing/malformed →
//                      redirect to `/`.
//                      Mounts under `<HatchLayout>` (lazy chunk) which wraps
//                      the route in WagmiProvider + RainbowKitProvider.
//   `/view`          → manual UUID lookup page
//   `/view/:tokenId` → token render. Wallet-free — reads tokenURI(tokenId)
//                      directly via publicClient, so no `<WagmiProvider>`.
//   `/bond`          → stage 2 placeholder
//   `*`              → `<Navigate to={ROUTES.home} replace />`; absorbs unknown paths.
//
// `HatchLayout` is lazy-loaded so Vite emits a separate chunk for the layout
// + its transitive imports (`wagmiConfig`, `WagmiProvider`, `RainbowKitProvider`,
// RainbowKit theme + CSS). The chunk loads only when a user navigates to
// `/hatch`; `/`, `/view`, `/view/<tokenId>`, `/bond` bypass the wagmi chunk
// entirely on cold load.
const HatchLayout = lazy(() => import('./layouts/HatchLayout'));

// Lazy-load `Hatch` for the same reason. App.tsx is statically loaded, so a
// static `Hatch` import would pull the wagmi hook subgraph (`useAccount`,
// `useReadContract`, `useWriteContract`, etc.) into the entry bundle and
// nullify the HatchLayout split.
const Hatch = lazy(() =>
  import('./routes/Hatch').then((m) => ({ default: m.Hatch })),
);

// Max chars of the raw fragment value we echo to the console before redirect. A
// valid UUID is 36 chars; anything much longer is almost certainly a probe
// or plugin-drift artifact and not worth logging in full.
const RAW_LOG_MAX = 64;

function readHashAccountUuid(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(fragment).get('accountUuid');
}

// Sole hatch ingress owner: reads `accountUuid` from the fragment and
// redirects to `/` when missing/malformed. On valid UUID it synchronously
// scrubs the fragment with `replaceState` before rendering the lazy hatch
// surface, so third-party-free app code never renders `/hatch` descendants
// while the UUID is still present in `location.href`.
function HatchGate(): JSX.Element {
  const location = useLocation();
  const accountUuidRef = useRef<string | null>(null);
  const rawFromHash = readHashAccountUuid(location.hash);

  if (rawFromHash !== null) {
    const accountUuid = rawFromHash.trim().toLowerCase();
    if (accountUuid !== '' && isValidUuid(accountUuid)) {
      accountUuidRef.current = accountUuid;
      window.history.replaceState(null, '', ROUTES.hatch);
      return <Hatch accountUuid={accountUuid} />;
    }

    const reason: 'missing' | 'malformed' =
      accountUuid === '' ? 'missing' : 'malformed';
    // eslint-disable-next-line no-console
    console.warn('[hatch] invalid accountUuid, redirecting to /', {
      reason,
      raw: reason === 'missing' ? null : rawFromHash.slice(0, RAW_LOG_MAX),
    });
    return <Navigate to={ROUTES.home} replace />;
  }

  if (accountUuidRef.current !== null) {
    return <Hatch accountUuid={accountUuidRef.current} />;
  }

  // Missing fragment. Query-param handoffs are intentionally no longer
  // accepted; raw UUIDs must not cross the HTTP wire.
  // eslint-disable-next-line no-console
  console.warn('[hatch] invalid accountUuid, redirecting to /', {
    reason: 'missing',
    raw: null,
  });
  return <Navigate to={ROUTES.home} replace />;
}

export default function App(): JSX.Element {
  useArrowRowNav();

  return (
    <Routes>
      <Route path={ROUTES.home} element={<Home />} />
      {/*
        `/hatch` mounts under the lazy `<HatchLayout>` parent route. The
        single `<Suspense fallback={null}>` wraps both the layout chunk and
        the inner `Hatch` chunk — both are lazy-loaded on first visit.
        `fallback={null}` is intentional: `HatchGate` renders nothing before
        its own gate runs, so a flash of "loading…" copy reads worse than
        nothing.
      */}
      <Route
        element={
          <Suspense fallback={null}>
            <HatchLayout />
          </Suspense>
        }
      >
        <Route path={ROUTES.hatch} element={<HatchGate />} />
      </Route>
      <Route path={ROUTES.view} element={<View />} />
      <Route path={ROUTES.viewToken} element={<ViewToken />} />
      <Route path={ROUTES.bond} element={<Bond />} />
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}

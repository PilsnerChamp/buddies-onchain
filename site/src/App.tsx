import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Home } from './routes/Home';
import { Bond } from './routes/Bond';
import { View } from './routes/View';
import { ViewUuid } from './routes/ViewUuid';
import { isValidUuid } from '~shared/isValidUuid';
import { useArrowRowNav } from './lib/useArrowRowNav';
import { ROUTES } from './config/routes';

// URL map:
//   `/`              → `<Home />`
//   `/hatch`         → execution surface; reads `accountUuid` via
//                      `useSearchParams`. Missing or malformed (fails
//                      `isValidUuid` shape check) → redirect to `/`.
//                      Mounts under `<HatchLayout>` (lazy chunk) which wraps
//                      the route in WagmiProvider + RainbowKitProvider.
//   `/view`          → disclosure surface with manual UUID lookup
//   `/view/:uuid`    → identity render. Wallet-free — uses `useBuddyLookup`
//                      (TanStack Query + viem publicClient), so no
//                      `<WagmiProvider>` is required.
//   `/bond`          → stage 2 placeholder
//   `*`              → `<Navigate to={ROUTES.home} replace />`; absorbs unknown paths.
//
// `HatchLayout` is lazy-loaded so Vite emits a separate chunk for the layout
// + its transitive imports (`wagmiConfig`, `WagmiProvider`, `RainbowKitProvider`,
// RainbowKit theme + CSS). The chunk loads only when a user navigates to
// `/hatch`; `/`, `/view`, `/view/<uuid>`, `/bond` bypass the wagmi chunk
// entirely on cold load.
const HatchLayout = lazy(() => import('./layouts/HatchLayout'));

// Lazy-load `Hatch` for the same reason. App.tsx is statically loaded, so a
// static `Hatch` import would pull the wagmi hook subgraph (`useAccount`,
// `useReadContract`, `useWriteContract`, etc.) into the entry bundle and
// nullify the HatchLayout split.
const Hatch = lazy(() =>
  import('./routes/Hatch').then((m) => ({ default: m.Hatch })),
);

// Max chars of the raw param we echo to the console before redirect. A
// valid UUID is 36 chars; anything much longer is almost certainly a probe
// or plugin-drift artifact and not worth logging in full.
const RAW_LOG_MAX = 64;

// Reads `accountUuid` from the query string and redirects to `/` when the
// value is missing or fails UUID shape validation. Emits `console.warn` so
// plugin-drift and probing rates are observable. On valid UUID, mounts the
// lazy `<Hatch />` route — the redirect short-circuit keeps invalid-UUID
// renders from instantiating wagmi hooks inside Hatch.
function HatchGate(): JSX.Element {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('accountUuid');
  const accountUuid = raw?.trim() ?? '';
  if (accountUuid === '' || !isValidUuid(accountUuid)) {
    const reason: 'missing' | 'malformed' =
      accountUuid === '' ? 'missing' : 'malformed';
    // `missing` encodes as `null` so the log discriminates empty-param from
    // shape-mismatch.
    // eslint-disable-next-line no-console
    console.warn('[hatch] invalid accountUuid, redirecting to /', {
      reason,
      raw: reason === 'missing' ? null : (raw ?? '').slice(0, RAW_LOG_MAX),
    });
    return <Navigate to={ROUTES.home} replace />;
  }
  return <Hatch />;
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
      <Route path={ROUTES.viewUuid} element={<ViewUuid />} />
      <Route path={ROUTES.bond} element={<Bond />} />
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}

import { lazy, Suspense, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './routes/Home';
import { Claim } from './routes/Claim';
import { View } from './routes/View';
import { ViewToken } from './routes/ViewToken';
import { useArrowRowNav } from './lib/useArrowRowNav';
import { ROUTES } from './config/routes';
import {
  encodeProviderBytes16,
  type ProviderBytes16,
} from '~shared/providerBytes16';

// URL map:
//   `/`              → `<Home />`
//   `/hatch`         → execution surface; reads identityHash + prngSeed +
//                      provider from the URL fragment, validates them,
//                      synchronously scrubs the URL, then passes all three as
//                      props. Missing/malformed → redirect to `/`.
//                      Mounts under `<HatchLayout>` (lazy chunk) which wraps
//                      the route in WagmiProvider + RainbowKitProvider.
//   `/view`          → lookup console (token id or account UUID)
//   `/view/:tokenId` → token render. Wallet-free — reads tokenURI(tokenId)
//                      directly via publicClient, so no `<WagmiProvider>`.
//   `/claim`         → stage 2 placeholder
//   `*`              → `<Navigate to={ROUTES.home} replace />`; absorbs unknown paths.
//
// `HatchLayout` is lazy-loaded so Vite emits a separate chunk for the layout
// + its transitive imports (`wagmiConfig`, `WagmiProvider`, `RainbowKitProvider`,
// RainbowKit theme + CSS). The chunk loads only when a user navigates to
// `/hatch`; `/`, `/view`, `/view/<tokenId>`, `/claim` bypass the wagmi chunk
// entirely on cold load.
const HatchLayout = lazy(() => import('./layouts/HatchLayout'));

// Lazy-load `Hatch` for the same reason. App.tsx is statically loaded, so a
// static `Hatch` import would pull the wagmi hook subgraph (`useAccount`,
// `useReadContract`, `useWriteContract`, etc.) into the entry bundle and
// nullify the HatchLayout split.
const Hatch = lazy(() =>
  import('./routes/Hatch').then((m) => ({ default: m.Hatch })),
);

type HatchHandoff = {
  identityHash: `0x${string}`;
  prngSeed: number;
  provider: ProviderBytes16;
};

type HatchHandoffParse =
  | { ok: true; handoff: HatchHandoff }
  | { ok: false; reason: 'missing' | 'malformed' };

const IDENTITY_HASH_RE = /^0x[0-9a-f]{64}$/;
const ZERO_IDENTITY_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
const MAX_UINT32 = 4_294_967_295;

function isValidIdentityHash(value: string): value is `0x${string}` {
  return IDENTITY_HASH_RE.test(value) && value !== ZERO_IDENTITY_HASH;
}

function parsePrngSeed(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_UINT32) {
    return null;
  }
  return parsed;
}

function readHashHandoff(hash: string): HatchHandoffParse {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (fragment === '') return { ok: false, reason: 'missing' };

  const params = new URLSearchParams(fragment);
  const rawIdentityHash = params.get('identityHash');
  const rawPrngSeed = params.get('prngSeed');
  const rawProvider = params.get('provider');
  if (
    rawIdentityHash === null ||
    rawIdentityHash === '' ||
    rawPrngSeed === null ||
    rawPrngSeed === '' ||
    rawProvider === null ||
    rawProvider === ''
  ) {
    return { ok: false, reason: 'missing' };
  }

  const prngSeed = parsePrngSeed(rawPrngSeed);
  let provider: ProviderBytes16;
  try {
    provider = encodeProviderBytes16(rawProvider);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!isValidIdentityHash(rawIdentityHash) || prngSeed === null) {
    return { ok: false, reason: 'malformed' };
  }

  return {
    ok: true,
    handoff: {
      identityHash: rawIdentityHash,
      prngSeed,
      provider,
    },
  };
}

// Sole hatch ingress owner: reads the fragment handoff and redirects to `/`
// when missing/malformed. On valid input it synchronously scrubs the fragment
// with `replaceState` before rendering the lazy hatch surface, so app code
// never renders `/hatch` descendants while the handoff is still present in
// `location.href`.
function HatchGate(): JSX.Element {
  const location = useLocation();
  const handoffRef = useRef<HatchHandoff | null>(null);
  const parsed = readHashHandoff(location.hash);

  if (parsed.ok) {
    handoffRef.current = parsed.handoff;
    window.history.replaceState(null, '', ROUTES.hatch);
    return (
      <Hatch
        identityHash={parsed.handoff.identityHash}
        prngSeed={parsed.handoff.prngSeed}
        provider={parsed.handoff.provider}
      />
    );
  }

  if (location.hash === '' && handoffRef.current !== null) {
    return (
      <Hatch
        identityHash={handoffRef.current.identityHash}
        prngSeed={handoffRef.current.prngSeed}
        provider={handoffRef.current.provider}
      />
    );
  }

  // Missing or malformed fragment. Query-param handoffs are intentionally not
  // accepted. Do not log fragment values: the hash and seed are pre-mint
  // handoff data and must be scrubbed rather than copied into telemetry.
  // eslint-disable-next-line no-console
  console.warn('[hatch] invalid handoff, redirecting to /', {
    reason: parsed.reason,
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
      <Route path={ROUTES.claim} element={<Claim />} />
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}

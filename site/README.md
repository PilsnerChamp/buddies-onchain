# Buddies Onchain — `site/`

Static SPA hosted on Vercel. Vite + React 18 + React Router + TanStack Query + wagmi v2 + RainbowKit. Plain CSS. Runtime: Bun.

Routes:

- `/` — cold-landing man-page terminal; also catch-all (unknown paths redirect here).
- `/hatch#identityHash=<hash>&prngSeed=<seed>` — execution surface for plugin handoffs; missing or malformed values redirect to `/`.
- `/view` — manual UUID lookup page.
- `/view/<tokenId>` — canonical buddy render (wallet-free).
- `/bond` — stage 2 placeholder.

## Local dev

```bash
cd site
bun install
cp .env.example .env.local    # adjust VITE_CHAIN if needed
bun run dev                   # serves http://localhost:5173
```

### Scripts

| Script | Purpose |
|---|---|
| `bun run dev` | Vite dev server on `:5173`. |
| `bun run build` | `tsc --noEmit` + Vite production build into `dist/`. |
| `bun run preview` | Serve the built `dist/` locally. |
| `bun run lint` | ESLint over `src/` (warnings only, non-blocking). |
| `bun run test` | Vitest unit tests. |

### Environment variables

See `.env.example`.

- `VITE_CHAIN` — `local | sepolia | mainnet`. Default `local`. Selects the active chain at build time.
- `VITE_WALLETCONNECT_PROJECT_ID` — required for the WalletConnect connector when `/hatch` is exercised.

## Deploy

Vercel static SPA. `vercel.json` carries:

- SPA rewrite: `/(.*)` → `/index.html`.
- Response headers: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (deny interest-cohort,
  camera, microphone, geolocation, payment), `X-Content-Type-Options: nosniff`.

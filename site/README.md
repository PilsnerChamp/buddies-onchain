# Buddies Onchain — `site/`

Static SPA hosted on Cloudflare Pages. Vite + React 18 + React Router + TanStack Query + wagmi v2 + RainbowKit. Plain CSS. Runtime: Bun.

Routes:

- `/` — cold-landing man-page terminal; also catch-all (unknown paths redirect here).
- `/hatch#identityHash=<hash>&prngSeed=<seed>&provider=<provider>` — execution surface for plugin handoffs; missing or malformed values redirect to `/`.
- `/view` — lookup console; one input takes a token id or an account UUID. UUIDs resolve to a tokenId client-side and never enter a URL.
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
- `VITE_WALLETCONNECT_PROJECT_ID` — WalletConnect Cloud project id for the RainbowKit connector on non-local chains (`sepolia`, `mainnet`). Required in production for WalletConnect / mobile-QR pairing. Local dev uses an injected-only path and a `dev` sentinel.

## Deploy

Cloudflare Pages, Git-integration build. Root dir `site`, build command `bun install --frozen-lockfile && bun run build`, output `dist`. Production branch `main`; PR and branch pushes get previews.

SPA routing lives in `site/public/_redirects`:

```
/* /index.html 200
```

Response headers live in `site/public/_headers`, applied to `/*`:

- `X-Frame-Options: DENY`.
- `Content-Security-Policy` — `script-src 'self'`; `connect-src 'self'` + both Base RPCs + WalletConnect relay/verify + `api.web3modal.org`; `frame-ancestors 'none'`; `form-action 'self'`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` — deny interest-cohort, camera, microphone, geolocation, payment.
- `X-Content-Type-Options: nosniff`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (no preload).

Chain flip is one build var: `VITE_CHAIN` (`sepolia` now, `mainnet` at launch). A build-time guard in `site/vite.config.ts` fails the build when a non-local chain has no committed manifest and no valid `VITE_BUDDY_NFT_ADDRESS` / `VITE_BUDDY_NFT_BLOCK` fallback.

Full Cloudflare var list: `docs/network-config.md`.

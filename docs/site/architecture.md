# Site architecture

Static dApp at `https://buddies-onchain.xyz/`. Vercel-hosted SPA. Wallet code lives behind a lazy chunk so wallet-free routes (`/`, `/view`, `/view/:uuid`, `/bond`) don't pull it.

## Stack

- Vite 5 SPA + React 18.
- React Router 6 (`react-router-dom`).
- TanStack Query 5 (`@tanstack/react-query`).
- wagmi v2 + RainbowKit 2.
- viem 2.
- Plain CSS — no Tailwind, no CSS-in-JS.

Source list in `site/package.json`. Build: `bun --cwd site run build` (runs `tsc --noEmit && vite build`).

## Module topology

`site/src/`:

- `main.tsx` — root mount. Hosts `<QueryClientProvider>` (stays in entry chunk).
- `App.tsx` — router shell. Lazy-imports `HatchLayout` and `Hatch`.
- `routes/` — `Home.tsx`, `Hatch.tsx`, `View.tsx`, `ViewUuid.tsx`, `Bond.tsx`.
- `layouts/HatchLayout.tsx` — wraps `/hatch` in `<WagmiProvider>` + `<RainbowKitProvider>`. Lazy-loaded.
- `components/` — `TerminalFrame`, `TerminalRouteShell`, `ManPageRow`, `ManPageSection`, `ColdHeroTerminal`, `BlinkingCursor`, `DotGridBackground`, `ViewLookupAction`, `RouteMetadata` (shared separator + AUTHOR + SEE ALSO + contract row).
- `lib/` — `useBuddyLookup.ts`, `decodeTokenUri.ts`, `hatch.ts`, `seeAlsoContractRow.ts`, `useArrowRowNav.ts`, `repoLinks.ts`, `pluginCommands.ts`, `authorLinks.ts`, `onchainConstants.ts`.
- `config/` — `network.ts`, `chains.ts`, `contract.ts`, `publicClient.ts`, `wagmi.ts`, `deployment.ts`, `routes.ts`.
- `styles/` — `tokens.css`, `global.css`, `man-page-extras.css`, `hover-variants.css`.

## Routes

`site/src/App.tsx`:

| Path | Element | Wallet? |
|---|---|---|
| `/` | `<Home />` | no |
| `/hatch` | `<HatchGate />` inside `<HatchLayout>` | yes (lazy) |
| `/view` | `<View />` (manual UUID lookup) | no |
| `/view/:uuid` | `<ViewUuid />` | no |
| `/bond` | `<Bond />` | no |
| `*` | `<Navigate to="/" replace />` | no |

`HatchGate` reads `accountUuid` from the query string. Missing or malformed (fails `isValidUuid`) → redirect to `/`.

## Wagmi-chunk split

`<WagmiProvider>` and `<RainbowKitProvider>` mount only inside `HatchLayout`, which `App.tsx` references via `React.lazy`. Vite emits a separate chunk for the wagmi + RainbowKit graph. Cold loads of `/`, `/view`, `/view/<uuid>`, `/bond` skip it entirely.

`Hatch` is also lazy. `App.tsx` is statically loaded, so a static `Hatch` import would pull wagmi hooks into the entry bundle and nullify the layout split. A single `<Suspense fallback={null}>` covers both lazy boundaries on the `/hatch` parent route.

`@rainbow-me/rainbowkit/styles.css` is imported from `HatchLayout.tsx`, not `main.tsx` — Vite chunks CSS with the JS module that imports it.

`<QueryClientProvider>` stays in `main.tsx` because `useBuddyLookup` (used by `/view/<uuid>`) depends on it. The wagmi split is what's lazy, not React Query.

## Wallet-free `/view`

`useBuddyLookup` (`site/src/lib/useBuddyLookup.ts`) wraps `getTokenIdByIdentity` + `tokenURI` in a TanStack Query call against `publicClient`. Returns a tagged union — `loading`, `error` (with `kind: 'tokenId' | 'tokenUri'`), or `success` with `pre-deploy` / `miss` / `hit` data. `/view/<uuid>` consumes this hook with no wallet connected.

Identity hash matches the plugin: `keccak256(toBytes(uuid.toLowerCase()))`. Cache key includes `chainId`. Stale time 30s.

## Network config

Active chain is selected at build time via `VITE_CHAIN={local|sepolia|mainnet}` (default `local`). Static metadata: `shared/networks.ts`. Deployment manifests: `onchain/deployments/<chainId>.json`. See `docs/network-config.md`.

`site/src/config/chains.ts::getNetwork(chainId)` is the site's merge accessor. Loader shape, pre-deploy fallback, and EIP-55 checksumming rules: [`docs/network-config.md`](../network-config.md#active-network-accessors).

## Style system

- `tokens.css` — design tokens (colors, fonts, spacing).
- `global.css` — base resets and document-level rules.
- `man-page-extras.css` — shared route primitives (`.terminal-action-row`, `.terminal-command-token`, `.terminal-inline-link`).
- `hover-variants.css` — interactive-state utilities reused across primitives.

Per-route CSS files (`Hatch.css`, `View.css`, `Bond.css`) scope to the route shell; primitives live in the shared sheets.

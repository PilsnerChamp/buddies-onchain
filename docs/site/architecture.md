# Site architecture

Static dApp at `https://buddies-onchain.xyz/`. Vercel-hosted SPA. Wallet code lives behind a lazy chunk so wallet-free routes (`/`, `/view`, `/view/:tokenId`, `/bond`) don't pull it.

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
- `routes/` — `Home.tsx`, `Hatch.tsx`, `View.tsx`, `ViewToken.tsx`, `Bond.tsx`.
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
| `/view` | `<View />` (lookup console — token id or account UUID) | no |
| `/view/:tokenId` | `<ViewToken />` | no |
| `/bond` | `<Bond />` | no |
| `*` | `<Navigate to="/" replace />` | no |

Routes in `site/src/config/routes.ts`. No route carries a UUID — no UUID ever appears in a path. `/view/:tokenId` is numeric-only — non-numeric, `tokenId <= 0`, or beyond `uint256` renders NotFound, not a redirect. A well-formed id with no minted buddy renders the lookup console in its miss state (`terminal-ui.md` § Lookup console), distinct from both NotFound and load errors.

### Hatch fragment

`HatchGate` reads `identityHash`, `prngSeed`, and `provider` from the URL fragment:

```
/hatch#identityHash=0x<64 lowercase hex>&prngSeed=<decimal uint32>&provider=claude
```

Fragments never cross the HTTP wire. The raw UUID is never in the fragment — the plugin already derived both args and supplied the provider label (see [`docs/plugin/architecture.md`](../plugin/architecture.md)). On the mint path the dApp is pure pass-through: it forwards `identityHash`, `prngSeed`, and the encoded `provider` to `hatch(bytes32, uint32, bytes16)` and derives nothing. `provider` is encoded to `bytes16` via `shared/providerBytes16.ts::encodeProviderBytes16`.

`HatchGate` owns parse, validate, and scrub: on arrival it synchronously `replaceState`s to `/hatch` before `<Hatch>` mounts, then passes the values down as props. `<Hatch>` never re-reads `location`. Reject if `identityHash` is not `0x` + 64 hex, if `prngSeed` is not a `uint32`, if `provider` fails `encodeProviderBytes16`, or if any is absent → redirect to `/`. The legacy `#accountUuid=` and `?accountUuid=` forms redirect home.

No third-party script (analytics, error reporter) may read `location.href` or the unscrubbed fragment on `/hatch`. The scrub runs before any reporter can capture it.

### Lookup console

Bare `/view` and the `/view/<tokenId>` miss state render one `<LookupConsole>` (STATUS and command header differ). Its single input is dual-grammar, shape-detected: all digits → token id → `navigate('/view/<id>')` directly, no contract read; UUID pattern → resolved to a `tokenId` client-side, then `navigate('/view/<tokenId>', { replace: true })`. The UUID stays in component state and never enters a URL.

## Wagmi-chunk split

`<WagmiProvider>` and `<RainbowKitProvider>` mount only inside `HatchLayout`, which `App.tsx` references via `React.lazy`. Vite emits a separate chunk for the wagmi + RainbowKit graph. Cold loads of `/`, `/view`, `/view/<tokenId>`, `/bond` skip it entirely.

`Hatch` is also lazy. `App.tsx` is statically loaded, so a static `Hatch` import would pull wagmi hooks into the entry bundle and nullify the layout split. A single `<Suspense fallback={null}>` covers both lazy boundaries on the `/hatch` parent route.

`@rainbow-me/rainbowkit/styles.css` is imported from `HatchLayout.tsx`, not `main.tsx` — Vite chunks CSS with the JS module that imports it.

`<QueryClientProvider>` stays in `main.tsx` because `useBuddyLookup` (used by `/view`) depends on it. The wagmi split is what's lazy, not React Query.

## Wallet-free `/view`

`useBuddyLookup` (`site/src/lib/useBuddyLookup.ts`) splits into two TanStack Query calls against `publicClient`: a UUID → `tokenId` resolver (`getTokenIdByIdentity`) for manual `/view`, and a `tokenId` → metadata loader (`tokenURI`) for `/view/<tokenId>`. The token page loads by `tokenId` directly and skips the identity-hash step. Both run with no wallet connected.

The `tokenURI` payload is decoded to the inline SVG, which renders as the terminal frame's interior — edge to edge, no chrome between SVG and frame. Token metadata (including the `Provider` attribute) stays on-chain-only; the token page surfaces the art, not a metadata register.

Identity hash matches the plugin via the shared `computeIdentityHash` (`shared/computeIdentityHash.ts`), `keccak256("buddies-onchain:identity:claude:v1" || 0x1f || lowercase(uuid))`. This runs for manual `/view` lookup only — the `/hatch` mint path takes a pre-computed `identityHash` from the fragment and never hashes a UUID. Cache key includes `chainId`. Stale time 30s.

## Network config

Active chain is selected at build time via `VITE_CHAIN={local|sepolia|mainnet}` (default `local`). Static metadata: `shared/networks.ts`. Deployment manifests: `onchain/deployments/<chainId>.json`. See `docs/network-config.md`.

`site/src/config/chains.ts::getNetwork(chainId)` is the site's merge accessor. Loader shape, pre-deploy fallback, and EIP-55 checksumming rules: [`docs/network-config.md`](../network-config.md#active-network-accessors).

## Style system

- `tokens.css` — design tokens (colors, fonts, spacing).
- `global.css` — base resets and document-level rules.
- `man-page-extras.css` — shared route primitives (`.terminal-action-row`, `.terminal-command-token`, `.terminal-inline-link`).
- `hover-variants.css` — interactive-state utilities reused across primitives.

Per-route CSS files (`Hatch.css`, `View.css`, `Bond.css`) scope to the route shell; primitives live in the shared sheets.

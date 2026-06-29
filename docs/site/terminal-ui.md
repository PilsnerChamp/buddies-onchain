# Terminal UI

The dApp is a terminal pretending to be a website. Every route reuses one man-page shape (NAME, DESCRIPTION, REQUIREMENTS, NEXT STEP(S), AUTHOR, SEE ALSO) and one interaction register. Cold `/` is the canonical visual sample; every other route matches its register. Route topology and module map live in `docs/site/architecture.md`.

## Routes and command echoes

Every man-page route opens with a `>` echo line — the literal command the page represents.

| Route | Echo line |
|---|---|
| `/` | `> /buddy-onchain --help` (route header); cold-hero action prompt below is `> claude ▊` |
| `/hatch` | `> /hatch --help` (route header); action prompt below is `> /hatch ▊` |
| `/view` | `> /view --help` |
| `/view/<tokenId>` miss | `> /view <tokenId>` |
| `/view/<tokenId>` hit | no man-page header — renders the SVG card only |
| `/claim` | `> /claim --help` |

`/hatch` is bare — no UUID or identity hash in the header or the action prompt. The plugin handoff arrives in the fragment and is scrubbed before render (see [`/hatch` handoff](#hatch-handoff-source)). The echo line is terminal-verbatim. Truncation belongs to REQUIREMENTS and stream lines, not the command header.

## Truncation rules

Two forms, one per identifier kind. Visual rhythm distinguishes them at a glance.

| Kind | Form | Example |
|---|---|---|
| Wallet address | first 10 (`0x` + 8 hex) + ellipsis + 4 | `0x1f3a5e2b…b209` |
| Tx hash | 6 + ellipsis + 4 | `0xabc1…1234` |

Ellipsis is the Unicode single-codepoint `…` (U+2026), never `...`.

No surface truncates a UUID — the typed `/view` UUID stays in component state unrendered, and `/hatch` carries no UUID at all. The `/hatch` REQUIREMENTS handoff row shows `identity hash + trait seed` as a presence label, not a truncated value. The post-hatch redirect line targets `/view/<tokenId>` and carries no UUID. The tokenId is small and shown in full.

## STATUS state matrix

Locked copy per state. Hatch route only — `/view`, `/claim`, etc. use simpler one-line status.

| Condition | STATUS line | Stream / error behavior |
|---|---|---|
| Pre-deploy (no contract on chain) | `not hatched · contract not yet deployed on this network` | muted `— not yet deployed —` stream line |
| Ready, before click or after retryable failure | `not hatched · ready to hatch` | no stream until the user runs the action prompt |
| Connecting wallet | `not hatched · connecting wallet` | `connecting wallet…` |
| Submitting wallet transaction | `not hatched · submitting transaction` | `submitting transaction…` |
| Awaiting confirmation | `not hatched · awaiting confirmation` | `submitting transaction…`, then `awaiting confirmation · <tx-hash>` |
| Tx failed before broadcast | `not hatched · ready to hatch` | `! <category-msg>` only |
| Tx failed after broadcast | `not hatched · ready to hatch` | submit + awaiting trail, then `! <category-msg>` |
| Tx failed (`event-parse-failed`) | `hatched · open /view` | submit + awaiting trail, then `! hatch confirmed — open /view to find your buddy` |
| Preflight already-hatched (`getTokenIdByIdentity` returns a tokenId) | (page does not render) | redirect to `/view/<tokenId>` |
| Tx confirmed during countdown | `hatched · redirecting to /view/<tokenId>` | submit + awaiting trail, `confirmed · token #N`, then `✓ buddy hatched · redirecting to /view/<tokenId> in Ns` |

The redirect targets `/view/<tokenId>` — the preflight uses the tokenId from `getTokenIdByIdentity`; the post-confirmation redirect uses the tokenId from the hatch tx. No UUID appears in either redirect line.

## Hatch command-run stream

`HatchStream` renders cumulative terminal output below the action prompt. It is derived from route state only — no local component state.

Sequence rules:

1. Pre-deploy emits only `— not yet deployed —` beside the muted action prompt.
2. If the flow opened a wallet modal, emit `connecting wallet…`; once an address is known, append `wallet connected · <truncated-address>`.
3. `submitting` emits `submitting transaction…`.
4. `pending` emits `submitting transaction…` and `awaiting confirmation · <tx-hash>`. The hash uses the 6+ellipsis+4 form and links to the chain explorer when available.
5. `confirmed` repeats the submit + awaiting trail, then emits `confirmed · token #N` and the success redirect line targeting `/view/<tokenId>` with the countdown cursor.
6. `failed` with no `txHash` emits only the error line. `failed` with a `txHash` preserves the submit + awaiting trail before the error line.

Hatch error category copy:

| Category | Stream line |
|---|---|
| `user-rejected` | `! tx cancelled — try again when ready` |
| `already-hatched` | `! already hatched — see /view` |
| `no-contract` | `! no contract on this network` |
| `event-parse-failed` | `! hatch confirmed — open /view to find your buddy` |
| `wallet-not-found` | `! wallet not found — install a Base-compatible wallet` |
| `wallet-rejected` | `! wallet connection cancelled` |
| `wrong-network` | `! wrong network — switch wallet to <network> (<chainId>)` — derived from the build's active network (e.g. `base sepolia (84532)`, `local (31337)`) |
| `generic` | `! hatch failed — no buddy created` |

## Section order

Every route renders sections in this order. Self-omitting routes drop their own SEE ALSO row.

```
> /<command> <args?>

STATUS
    <state line>

[NAME]
    (cold only)

DESCRIPTION
    <prose>

[REQUIREMENTS]
    (hatch only — account-uuid + wallet rows)

NEXT STEP | NEXT STEPS
    <action prompt + optional inline notes>

> <action prompt> ▊

-------------------------------------------------------------------------
AUTHOR
    @PilsnerChamp

SEE ALSO
    <self-omitted route list>
    github                                      PilsnerChamp/buddies-onchain
    opensea                                     opensea.io/collection/buddies-onchain
    0x<contract-address>                        contract - <chain>
```

The `opensea` row links the OpenSea collection page; it appears only when the active chain has a live collection (mainnet) and is omitted on local/sepolia/pre-deploy. The `/view/<tokenId>` card is the exception — it has no SEE ALSO footer, so its OpenSea (per-item) and contract links ride the titlebar's right column as icons instead (see `TitlebarTrustIcons`).

`/hatch` uses `STATUS, DESCRIPTION, REQUIREMENTS, NEXT STEP, AUTHOR, SEE ALSO` (no NAME — state-first per warm-action intent).

## SEE ALSO row pattern

Cold `/` SEE ALSO is the canonical model. Every sibling route matches byte-for-byte aside from the self-omitted row.

### Markup contract

Each row is one `<Link>` / `<a>` styled as a CSS subgrid that aligns inner `__k` / `__v` cells to the parent grid columns. One hit target per row, one focus stop, one hover hook. `aria-label` on the row anchor combines key + descriptor for clean screen-reader concatenation. The pre-deploy contract row (`href === null`) renders as a plain `<div>` with `.hover-row--inert` — no anchor, no hover.

### Cold-shape parity (cross-route)

- Repo row label: literal `github`; descriptor is the `PilsnerChamp/buddies-onchain` shorthand.
- `/claim` row in SEE ALSO: plain `stage 2` only — never `stage 2 · not yet implemented`. Deeper disclosure stays on `/claim`'s own STATUS line.
- Contract row chunks join with ASCII ` - ` separators (not ` · `).
- Each route self-omits its own row.

### Per-route row order

| Route | SEE ALSO order |
|---|---|
| `/` | `/hatch` (when relevant) → `/view` → `/claim` → repo → opensea → contract |
| `/hatch` | `/view` → `/claim` → repo → opensea → contract |
| `/view` | `/hatch` → `/claim` → repo → opensea → contract |
| `/view/<tokenId>` miss | `/` → `/view` → `/claim` → repo → opensea → contract — `/hatch` intentionally absent (hatch starts from plugin handoff, not a miss-card CTA) |
| `/claim` | `/` → `/hatch` → `/view` → repo → opensea → contract |

### Contract row linkability

The contract row's `href` is `null` whenever the active chain has no deployment (pre-deploy) or the chain has no explorer base. Pre-deploy renders the row inert; once deployed, the row links to the explorer's address page on the active chain. A refactor that silently changes either the address formatting (`0x` + 4 hex + ellipsis + 4 — compact form matching tx-hash truncation, not the longer wallet form) or the linkability gate would be a regression.

### OpenSea row linkability

Unlike the contract row, the `opensea` collection row has no inert state: when there is no live collection (local/sepolia/pre-deploy/unknown chain), `openseaCollectionRow` returns `null` and the row is dropped entirely — never rendered as a dead `--inert` placeholder. It always links out (`target="_blank"`) when present. Label is the literal `opensea`; descriptor is the protocol-stripped collection URL.

## Action prompt rules

The focal row after NEXT STEP/STEPS. Doubles as cursor-of-record. Three modes:

- **Active** — focusable `<button>` (or an input-owning row for `/view`: clickable wrapper `<div>` with deliberately no `role="button"` because the labelled `<input>` and hidden submit button own keyboard/screen-reader semantics). Sigil + cmd token + blinking cursor block. Click / Enter triggers action.
- **Committed** — plain `<p>` (or `<div>`). Same sigil + cmd, no cursor, no click target. Used while a multi-step flow is running (`/hatch` post-click).
- **Muted** — plain `<p>` with `aria-disabled`. Muted colour scheme, optional static cursor slot for visual parity (`/claim` disabled prompt, `/hatch` pre-deploy).

Always-on transparent 1px border on the row baseline so the highlight variant's border-color flip causes no layout shift.

Per-route mapping:

| Route | Action prompt |
|---|---|
| `/` | `> claude ▊` (active button — replays walkthrough on click) |
| `/hatch` | `> /hatch ▊` (active → committed → re-active on failure / retry) |
| `/view` | `> /view [<token-id> \| <account-uuid>] ▊` (unified lookup console — active row wrapping `<input>`; row click triggers attempt; click on input focuses for typing) |
| `/view/<tokenId>` miss | same prompt — the miss state renders the same `<LookupConsole>` as bare `/view`; STATUS and the command header are the only differences |
| `/view/<tokenId>` loading / error / pre-deploy | no action prompt; tail `> ▊` cursor is cursor-of-record |
| `/claim` | `> /claim ▊` (muted, inert, holds cursor slot for parity) |

## Cursor slot exclusivity

Every route renders exactly one blinking cursor at any moment. Two blinking cursors fight for attention — banned.

- Action prompt present → action prompt owns the cursor → `<TerminalRouteShell>` mounts without `showCursor`.
- Action prompt absent → tail `> ▊` cursor mounts via `<TerminalRouteShell showCursor>`. Only `/view/<tokenId>` loading / error / pre-deploy states do this today.
- Muted disabled action prompt (`/claim`) carries a static (non-blinking) cursor slot — counts as inert visual parity, not a competing cursor.

## Cross-cutting interaction rules

### Hover register

One treatment applies uniformly to every actionable surface. Tokens cascade from `:root` in `site/src/styles/hover-variants.css`; the `.hover-row` class hooks them.

| Token | Value |
|---|---|
| `--hover-row-bg` | `color-mix(in srgb, var(--accent) 8%, transparent)` |
| `--hover-row-border-color` | `transparent` (kept for layout stability) |
| `--hover-row-glow` | `0 0 12px color-mix(in srgb, var(--accent) 55%, transparent)` |
| `--hover-sigil-color` | `var(--fg)` |
| `--hover-key-color` | `var(--fg)` |
| `--hover-value-color` | `var(--fg)` |
| `--hover-transition-duration` | `150ms` |

Constraints: opacity / colour / `text-shadow` transitions only. No `transform`, no `scale()`, no `translate*`, no animated `width`/`height`. No layout shift. `prefers-reduced-motion: reduce` → instant accent state, no transitions.

### Where it applies

- Cold action prompt (`> claude ▊` button)
- `/hatch` action prompt (active button only — committed `<p>` does not)
- `/view` lookup console input wrapper (bare and miss states)
- `/claim` disabled action prompt (`.hover-row--inert` so no hover fires)
- All SEE ALSO row anchors on every route (and the inert pre-deploy contract row's `<div>`, also `--inert`)
- AUTHOR link (`@PilsnerChamp` X-link row)

### Focus-on-load posture

Auto-focused action prompts (cold-hero, `/hatch`, `/view` input wrapper) must not render in the hover-lit state on initial load. The blinking cursor block already signals "this is active" — adding row-level fill on load over-shouts.

Implementation pattern: gate the `.hover-row` class behind a "first user interaction" flag. Only mount `.hover-row` after `keydown` / `pointerdown` / `pointermove` / `wheel` / `touchstart`. Defends against Chromium matching `:focus-visible` on autofocus.

### Touch-target sizing

`:hover` rules wrapped in `@media (hover: hover) and (pointer: fine)`. Coarse-pointer media swaps to tap-down `:active` only with ≥ 44 px hit-target padding. Every `.hover-row` gets `min-height: 44px` + 8 px vertical padding under coarse-pointer media.

### Replay-on-click

Cold-hero walkthrough remounts via `replayKey` bump → CSS animation runs from frame 0 (typewriter `width` clip). `/view` action error line reuses the same idiom — `errorKey` bump on each failed click attempt remounts the warn `<p>` so the opacity fade-in keyframe replays. Mount-time opacity animation only; never hover.

### Cross-route action prompt slot

Bare `/view` and the `/view/<tokenId>` miss state render the same `<LookupConsole>` — they are one command surface in two states ("no arg supplied" / "arg supplied, lookup missed"); STATUS and the command header are the only differences. Same cursor-slot exclusivity rule applies — the console's action prompt owns the cursor in both states and the tail `> ▊` is suppressed.

## Route-specific copy

### `/claim` placeholder

```
STATUS
    ! stage 2 · not yet implemented
```

The warn pill (`! ...`) carries the long form on `/claim` itself. SEE ALSO rows on other routes display only `stage 2`.

### Lookup console (`/view` bare + `/view/<tokenId>` miss)

One console, two states — bare `/view` is "no arg supplied", the miss state is "arg supplied, lookup missed". Both render `<LookupConsole>`; STATUS and the command header (`> /view --help` / `> /view <tokenId>`) are the only differences. NEXT STEPS carries the lookup UI — no separate LOOKUP man-page section, no `[View buddy]` button. The action prompt composes the prompt sigil, an inline `<input>` styled to match terminal text, and the blinking cursor block.

The input is dual-grammar, shape-detected, SYNOPSIS-style:

```
> /view [<token-id> | <account-uuid>] ▊
```

All digits → token id (public, sequential, browsable) → navigate to `/view/<id>`. UUID pattern → account UUID (resolves only the holder's own buddy) → resolves client-side via identityHash → `getTokenIdByIdentity`, navigating to the canonical `/view/<tokenId>` on hit; the UUID lives in component state only and never enters a URL. A buddy answers to both keys on-chain — the console exposes both through one slot. The SYNOPSIS line is the whole affordance: no auto-detect helper copy, no privacy-reassurance toast (declarative register).

STATUS lines: bare idle `no id supplied · enter a token id or account UUID`; UUID resolving `looking up · resolving token id`; UUID miss `not found · no buddy for this UUID on this network`; miss state pins `not found · no buddy for this token on this network` (UUID attempts from the miss state report in the feedback line, not STATUS). NEXT STEPS stays plugin-first ("Run `/buddy-onchain` in Claude Code…") with the input as the secondary path; the miss state frames it as trying another id — browse register, never "find your buddy".

The prompt owns one sync warn slot with two messages, both replaying via key-bump remount: `! enter a valid token id or account uuid` (empty/malformed) and `! not found — try a different token id` (known token-id miss). The not-found warn fires when the submitted id equals the miss state's own id (warn in place, no navigation — the page wouldn't change) and when a retry navigation lands on another miss (router-state flag; the new console is near-identical, so without the warn the attempt reads as a no-op). Async UUID lookup feedback (`looking up buddy…` / `! no buddy found for that UUID on this network` / pre-deploy) renders in its own line below the prompt; typing clears the sticky warn and resets the async feedback, so the two never describe different attempts. Direct links mount warn-free. Miss consoles are keyed by tokenId so retry navigations reset input/warn state.

### `/hatch` handoff source

The plugin handoff arrives in the URL fragment, never the query string and never as a raw UUID:

```
/hatch#identityHash=0x<64 lowercase hex>&prngSeed=<decimal uint32>&provider=claude
```

The fragment-parse/validate/scrub owner is in `App.tsx`, not the hatch surface. On arrival it reads the fragment, validates `identityHash` (`0x` + 64 hex), `prngSeed` (a `uint32`), and `provider` (encodable to `bytes16`), synchronously `replaceState`s the URL to bare `/hatch`, and passes the values to the surface as props. The surface never re-reads the URL — after the scrub it carries no fragment.

Missing or malformed `identityHash`/`prngSeed`/`provider`, or the legacy `#accountUuid=` form → redirect to `/`. The surface forwards the values to `hatch(bytes32, uint32, bytes16)` unchanged; it derives nothing.

The REQUIREMENTS section shows a `handoff` row valued `identity hash + trait seed` with status `connected` — a presence indicator. Neither value is echoed into copy. See [`docs/site/architecture.md`](architecture.md#hatch-fragment).

## Cold hero (`/`)

Separate walkthrough terminal above the man-page block. Two distinct visual zones; both inside the same terminal frame.

- Action prompt: `> claude ▊` — active button. Click replays the walkthrough typewriter animation from frame 0.
- Tail cursor: suppressed. The action prompt IS the cursor-of-record.
- Walkthrough: CSS `width` typewriter clip — the one allowed non-opacity mount animation.

`<Home />` renders the cold landing without `showCursor` — cold ends after SEE ALSO with no tail prompt.

## Separator rail

Single full-width row of `-` glyphs between the NEXT STEP block and the route metadata sections (AUTHOR / SEE ALSO). Same shape across every route. Constant: `'-'.repeat(200)` clipped by the terminal viewport width.

## Per-route gaps

Route command headers pin page identity: `> /hatch --help`, `> /view --help`, `> /view <tokenId>` for miss cards, and `> /claim --help`. The active hatch action prompt carries bare `> /hatch ▊` below NEXT STEP — no UUID, no identity hash.

## OG card

Default `og-home.png` renders the cold-hero terminal. The terminal is the project's recognizable surface and carries the unfurl.

## File map

- Routes: `site/src/routes/Home.tsx`, `Hatch.tsx`, `View.tsx`, `ViewToken.tsx`, `Claim.tsx`
- Shared shell: `site/src/components/TerminalRouteShell.tsx`, `TerminalFrame.tsx`, `BlinkingCursor.tsx`
- Cold action prompt: `site/src/components/ColdHeroTerminal.tsx`
- View action prompt: `site/src/components/ViewLookupAction.tsx`
- Man-page primitives: `site/src/components/ManPageSection.tsx`, `ManPageRow.tsx`
- Tokens: `site/src/styles/tokens.css`
- Hover register: `site/src/styles/hover-variants.css`
- Cross-route primitives: `site/src/styles/man-page-extras.css` (SEE ALSO grid, AUTHOR link, separator rail, status helpers)
- Arrow-row navigation: `site/src/lib/useArrowRowNav.ts`
- Contract row helpers: `site/src/lib/seeAlsoContractRow.ts`

See `docs/site/architecture.md` for routes, wagmi-chunk split, and wallet-free `/view` data flow.

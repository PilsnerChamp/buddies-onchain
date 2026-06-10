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
| `/bond` | `> /bond --help` |

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

Locked copy per state. Hatch route only — `/view`, `/bond`, etc. use simpler one-line status.

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
| `wrong-network` | `! wrong network — switch to <network> (<chainId>)` — derived from the build's active network (e.g. `base sepolia (84532)`, `local (31337)`) |
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
    0x<contract-address>                        contract - <chain>
```

`/hatch` uses `STATUS, DESCRIPTION, REQUIREMENTS, NEXT STEP, AUTHOR, SEE ALSO` (no NAME — state-first per warm-action intent).

## SEE ALSO row pattern

Cold `/` SEE ALSO is the canonical model. Every sibling route matches byte-for-byte aside from the self-omitted row.

### Markup contract

Each row is one `<Link>` / `<a>` styled as a CSS subgrid that aligns inner `__k` / `__v` cells to the parent grid columns. One hit target per row, one focus stop, one hover hook. `aria-label` on the row anchor combines key + descriptor for clean screen-reader concatenation. The pre-deploy contract row (`href === null`) renders as a plain `<div>` with `.hover-row--inert` — no anchor, no hover.

### Cold-shape parity (cross-route)

- Repo row label: literal `github`; descriptor is the `PilsnerChamp/buddies-onchain` shorthand.
- `/bond` row in SEE ALSO: plain `stage 2` only — never `stage 2 · not yet implemented`. Deeper disclosure stays on `/bond`'s own STATUS line.
- Contract row chunks join with ASCII ` - ` separators (not ` · `).
- Each route self-omits its own row.

### Per-route row order

| Route | SEE ALSO order |
|---|---|
| `/` | `/hatch` (when relevant) → `/view` → `/bond` → repo → contract |
| `/hatch` | `/view` → `/bond` → repo → contract |
| `/view` | `/hatch` → `/bond` → repo → contract |
| `/view/<tokenId>` miss | `/` → `/view` → `/bond` → repo → contract — `/hatch` intentionally absent (hatch starts from plugin handoff, not a miss-card CTA) |
| `/bond` | `/` → `/hatch` → `/view` → repo → contract |

### Contract row linkability

The contract row's `href` is `null` whenever the active chain has no deployment (pre-deploy) or the chain has no explorer base. Pre-deploy renders the row inert; once deployed, the row links to the explorer's address page on the active chain. A refactor that silently changes either the address formatting (`0x` + 4 hex + ellipsis + 4 — compact form matching tx-hash truncation, not the longer wallet form) or the linkability gate would be a regression.

## Action prompt rules

The focal row after NEXT STEP/STEPS. Doubles as cursor-of-record. Three modes:

- **Active** — focusable `<button>` (or wrapper `<div role="button">` when an `<input>` lives inside, e.g. `/view`). Sigil + cmd token + blinking cursor block. Click / Enter triggers action.
- **Committed** — plain `<p>` (or `<div>`). Same sigil + cmd, no cursor, no click target. Used while a multi-step flow is running (`/hatch` post-click).
- **Muted** — plain `<p>` with `aria-disabled`. Muted colour scheme, optional static cursor slot for visual parity (`/bond` disabled prompt, `/hatch` pre-deploy).

Always-on transparent 1px border on the row baseline so the highlight variant's border-color flip causes no layout shift.

Per-route mapping:

| Route | Action prompt |
|---|---|
| `/` | `> claude ▊` (active button — replays walkthrough on click) |
| `/hatch` | `> /hatch ▊` (active → committed → re-active on failure / retry) |
| `/view` | `> /view [<uuid-input>] ▊` (active row wrapping `<input>`; row click triggers attempt; click on input focuses for typing) |
| `/view/<tokenId>` miss | same as `/view` (shared `<ViewLookupAction>` component) |
| `/view/<tokenId>` loading / error / pre-deploy | no action prompt; tail `> ▊` cursor is cursor-of-record |
| `/bond` | `> /bond ▊` (muted, inert, holds cursor slot for parity) |

## Cursor slot exclusivity

Every route renders exactly one blinking cursor at any moment. Two blinking cursors fight for attention — banned.

- Action prompt present → action prompt owns the cursor → `<TerminalRouteShell>` mounts without `showCursor`.
- Action prompt absent → tail `> ▊` cursor mounts via `<TerminalRouteShell showCursor>`. Only `/view/<tokenId>` loading / error / pre-deploy states do this today.
- Muted disabled action prompt (`/bond`) carries a static (non-blinking) cursor slot — counts as inert visual parity, not a competing cursor.

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
- `/view` lookup action input wrapper
- `/view/<tokenId>` miss-card lookup action input wrapper
- `/bond` disabled action prompt (`.hover-row--inert` so no hover fires)
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

`/view/<tokenId>` miss reuses the bare-`/view` action prompt (`<ViewLookupAction>`) so a user landing on a miss can re-engage with another lookup without navigating back. Same cursor-slot exclusivity rule applies — the action prompt owns the cursor on the miss card and the tail `> ▊` is suppressed.

## Route-specific copy

### `/bond` placeholder

```
STATUS
    ! stage 2 · not yet implemented
```

The warn pill (`! ...`) carries the long form on `/bond` itself. SEE ALSO rows on other routes display only `stage 2`.

### `/view` bare lookup

`NEXT STEP` carries the lookup UI. No separate LOOKUP man-page section. No `[View buddy]` button. The action prompt composes the prompt sigil, an inline `<input>` styled to match terminal text (no bracketed button), and the blinking cursor block.

### `/view/<tokenId>` miss card

STATUS reads `not found · no buddy for this token on this network`. DESCRIPTION separates validity from existence — the tokenId is numeric and well-formed; the contract lookup just missed. NEXT STEPS stays plugin-first for the holder path with manual retry through `/view`.

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

Route command headers pin page identity: `> /hatch --help`, `> /view --help`, `> /view <tokenId>` for miss cards, and `> /bond --help`. The active hatch action prompt carries bare `> /hatch ▊` below NEXT STEP — no UUID, no identity hash.

## OG card

Default `og-home.png` renders the cold-hero terminal. The terminal is the project's recognizable surface and carries the unfurl.

## File map

- Routes: `site/src/routes/Home.tsx`, `Hatch.tsx`, `View.tsx`, `ViewToken.tsx`, `Bond.tsx`
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

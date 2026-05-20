# Renderer

Fully on-chain SVG produced by `BuddyRenderer.tokenURI()`. Animation, sprite geometry, and stripping fallbacks live here. Trait derivation lives in `docs/onchain/derivation.md`; contract storage and the hatch flow live in `docs/onchain/contract.md`.

## Pipeline

`BuddyNFT.tokenURI(id)` delegates to `BuddyRenderer`, which composes:

1. Background `<defs>` + `<rect>` + three decorative `<circle>` nodes.
2. Chrome rail: `> /buddy-onchain` prompt, title (`RARITY │ SPECIES │ STAGE`), top rule, sprite stack, bottom rule, footer stats.
3. Four sprite groups (`#f0`, `#f1`, `#f2`, `#fb`) stacked at identical coordinates.
4. One `<style>` block with embedded WOFF2 `@font-face` rules, text-tier fills, animation keyframes, and drift keyframes.

Result: a base64 `data:image/svg+xml` URL inside a `data:application/json` token URI. No off-chain hosting, no IPFS, no `animation_url`.

## SVG document shape

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 420">
  <title>Buddy #N — RARITY · SPECIES</title>
  <style>
    /* WOFF2 @font-face for BuddyFont + BuddySpriteFont */
    /* .sprite{fill:#e2e8f0} .stat{fill:#cbd5e1} */
    /* @keyframes f0 / f1 / f2 / fb       — sprite cycle */
    /* @keyframes drift0 / drift1 / drift2 — background circles */
  </style>
  <defs><clipPath id="vp">…</clipPath><linearGradient id="bg">…</linearGradient></defs>
  <g clip-path="url(#vp)">
    <rect width="420" height="420" fill="url(#bg) hsl(…)"/>
    <circle id="c0" …/><circle id="c1" …/><circle id="c2" …/>
  </g>
  <g font-family="monospace" fill="#cbd5e1">    <!-- chrome group -->
    <text class="stat" y="28">…prompt…</text>
    <text class="stat" y="56">…title…</text>
    <text class="stat" y="82" textLength="388">…top rule…</text>
    <g id="f0" fill="#e2e8f0" font-size="37">…5 sprite rows…</g>
    <g id="f1" fill="#e2e8f0" font-size="37" visibility="hidden">…</g>
    <g id="f2" fill="#e2e8f0" font-size="37" visibility="hidden">…</g>
    <g id="fb" fill="#e2e8f0" font-size="37" visibility="hidden">…</g>
    <text class="stat" y="372" textLength="388">…bottom rule…</text>
    <text class="stat" y="398" textLength="388">…footer stats…</text>
  </g>
</svg>
```

## Sprite geometry

### Storage grid

- 18 species × 3 frames × 5 rows × **17 UTF-8 bytes** per body row in `BuddySpriteData`.
- 8 hats × **13 UTF-8 bytes** per hat row.
- ASCII `0` inside a body row is the eye sentinel — exactly 1 byte, 1 visible column, substituted with the trait eye glyph at render time.
- Multi-byte glyphs (`´`, `ω`) cost more bytes than visible columns; the generator enforces the byte budget.

### Horizontal centering (frame 0 only)

Generator computes one horizontal shift for each species from frame 0 and applies it to all three frames. Frames 1 and 2 must absorb the same shift or generation fails loudly.

```
1. Tokenize frame 0 rows into visible columns (space = empty, eye sentinel = 1 col, every other codepoint = 1 col).
2. bboxLeft  = leftmost non-space column across all 5 rows.
   bboxRight = rightmost non-space column across all 5 rows.
   bboxWidth = bboxRight - bboxLeft + 1.
3. targetLeft   = ceil((17 - bboxWidth) / 2)   ← ceil() biases parity ties one column right.
4. desiredShift = targetLeft - bboxLeft.
5. Apply desiredShift to every row of every frame. Frames lacking slack throw.
```

Frame-0 authority keeps the body from wobbling between frames during animation. Authored sprites are already pre-centered, so today's shift is `0` across the board — the math is defensive against future authoring drift.

### Hat composition

Hats are centered inside their 13-byte slot using the same bbox + ceil math, then composed into a 17-byte body row at render time:

```solidity
rawRow = string.concat("  ", spriteData.getHatRow(traits.hat), "  ");
```

Fixed 2-leading + 2-trailing spaces lift the 13-byte hat row to 17 bytes. The hat substitution gate sits at frame-time:

```solidity
if (row == 0 && traits.hat != 0 && _isBlankRow(rawRow)) { … }
```

For the 8 row-0-using species, frame 2's row 0 is non-blank, so hat substitution skips frame 2 only. The hat steps aside for the species's frame-2 emote (`~    ~`, `o`, spark, spores, etc.) for one tick per cycle. This one-tick hat flicker is canonical Claude Code behavior, preserved on chain.

### Vertical row-0 reservation

A species needs the full 5-row band if **any** of these hold:

- `traits.hat != 0` — the hat occupies row 0.
- Any frame paints content at row 0 — body anatomy or an emote uses the slot.

`BuddySpriteData.BODY_USES_ROW_0` is a `uint32` bitmap (`0x000174B0`) with bit `i` set when species `i` paints row 0 in any frame. `BuddyRenderer._spriteSurface` reads:

```solidity
bool halfHeightTopSlot = (traits.hat == 0) && !spriteData.bodyUsesRow0(traits.species);
```

| `halfHeightTopSlot` | row 0 | row 1 | row 2 | row 3 | row 4 |
|---|---|---|---|---|---|
| false (full 5-row) | 125 | 175 | 225 | 275 | 325 |
| true (compressed top) | 125 | 150 | 200 | 250 | 300 |

Row 0 always emits as a `<text>` element — only the gap to row 1 differs. The single `halfHeightTopSlot` value is computed once per render and applies identically to all four sprite groups, so frames never drift vertically.

## Animation

CSS `@keyframes` over the four stacked sprite groups. SMIL rejected for sanitizer resilience and Solidity-generation simplicity.

### Timing

```solidity
uint32  TICK_MS         = 500;
bytes15 IDLE_SEQUENCE   = 0x0000000001000000FF000002000000;  // Claude Code parity
uint8   SEQUENCE_LENGTH = 15;
uint32  CYCLE_MS        = TICK_MS * SEQUENCE_LENGTH;          // 7500 ms
```

15 ticks × 500 ms = 7.5 s loop. Frame 0 dominates 12/15 ticks (~80% rest). Frames 1 and 2 each appear once per cycle. Byte value `0xFF` marks blink (frame 0 with eyes swapped to `-`).

For each distinct sequence value (`0x00`, `0x01`, `0x02`, `0xFF`) the renderer walks `IDLE_SEQUENCE` and emits one `@keyframes fV` rule whose per-tick percentage windows mark `visibility: visible` for the ticks where the byte matches. Example, frame 1 at tick index 4:

```css
@keyframes f1 {
  0%, 26.65%    { visibility: hidden; }
  26.66%, 33.32% { visibility: visible; }   /* tick 4 slice: 4/15 .. 5/15 */
  33.33%, 100%  { visibility: hidden; }
}
#f1 { animation: f1 7500ms infinite step-start; }
```

`step-start` timing function only. No `ease`, no `linear`, no opacity blending, no transform — hard cuts.

### Frame structure

```xml
<g id="f0" fill="#e2e8f0" font-size="37">…frame 0 rows…</g>
<g id="f1" fill="#e2e8f0" font-size="37" visibility="hidden">…frame 1 rows…</g>
<g id="f2" fill="#e2e8f0" font-size="37" visibility="hidden">…frame 2 rows…</g>
<g id="fb" fill="#e2e8f0" font-size="37" visibility="hidden">…frame 0 rows with eyes = "-"…</g>
```

- All four groups share `viewBox`, `x`, `y`, and the single `halfHeightTopSlot` value — no inter-frame jitter.
- `visibility="hidden"` is set as an **SVG attribute**, not a CSS rule. Attribute applies pre-style-parse and survives `<style>` stripping. Three jobs: defends against flash-of-all-frames on first paint, locks the t=0 frame for external rasterizers, and degrades cleanly when `<style>` is stripped.
- Blink (`#fb`) duplicates frame 0 with every occurrence of `traits.eye` replaced by `-`. One tick per cycle (500 ms at parity).

### Shiny label

When `traits.shiny == true`, the title line prefix `✦SHINY✦ ` renders in yellow `#FFC107` via inline attributes only:

```xml
<text class="stat" y="56" xml:space="preserve">
  <tspan fill="#FFC107" font-weight="bold">✦SHINY✦ </tspan>LEGENDARY │ DRAGON │ HATCHED
</text>
```

No shiny CSS class is emitted. The inline `fill` + `font-weight` pair is the styling source in both rich and stripped renders. The trailing space inside the tspan is what `xml:space="preserve"` protects.

### Background circle drift

Three decorative HSL-tinted background circles drift continuously via CSS `@keyframes` + `transform: translate()`. Periods come from a coprime prime pool deliberately outside the sprite's 7.5 s / 15 s / 22.5 s harmonics:

```
PRIMES = (29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71)   // seconds
```

Per circle `i ∈ {0, 1, 2}`:

```
mix    = ((cx * 73856093) ^ (cy * 19349663) ^ (i * 83492791)) & 0xFFFFFFFF
period = pool[mix % poolSize]              // sampled without replacement
delay  = (mix >> 8) % period               // emitted as -Ns to start mid-cycle
```

Three pre-baked waypoint shapes (`drift0` clockwise ellipse, `drift1` figure-eight, `drift2` lazy triangle), one per circle by index. Amplitudes capped at ≤ 18 px so circles near the canvas edge stay on-canvas. Timing function: `ease-in-out`. Mixing discrete sprite motion with continuous background motion is specific to this renderer's background layer.

`cx`/`cy` remain `<circle>` attributes; `transform` only adds a delta. If keyframes never evaluate (CSS unsupported, `<style>` stripped, rasterizer at t=0), circles render statically at `cx`/`cy`. No off-canvas failure mode.

## Stripping fallbacks

Some wallet previewers strip `<style>` entirely while keeping inline attributes, `style=""`, `<defs>`, paint shapes, and `visibility=""`. The renderer pre-pays defensive inline attributes that mirror the CSS rules so the rich render stays unchanged (CSS cascade wins) while the stripped render stays legible.

### Mirror principle

A presentation attribute is safe on an element only when a CSS rule already declares that same property on the element's class (or ancestor). The cascade beats presentation attributes in rich renders; the attribute survives stripping.

### Two-tier text fill

Chrome (`.stat`) and sprite (`.sprite`) fills, font family, and font size are emitted as attributes — **hoisted onto wrapping `<g>` elements** to avoid per-text repetition:

- Outer chrome `<g font-family="monospace" fill="#cbd5e1">` wraps every chrome line. Per-text `font-size="N"` stays inline because chrome (18) and sprite (37) differ.
- Per-frame `<g id="fN" fill="#e2e8f0" font-size="37">` overrides the outer fill to the slate-200 tier and pins sprite size.
- `font-family` is inherited from the chrome wrapper through the sprite groups — no per-text repetition.

Per-text strip-fallback tests should check each `<text>` for the attribute OR walk ancestor `<g>` elements (self-or-ancestor effective attribute).

### No `font-weight` on body text

- Chrome (`.stat`): browser requests 400, `BuddyFont` ships at descriptor 600. Single-face match → fine. Adding `font-weight="600"` would change nothing visible.
- Sprite (`.sprite`): browser requests 400, `BuddySpriteFont` ships at descriptor 400. Exact match. Adding `font-weight="600"` would force synthetic bolding in stripped mode — real regression.

Drop `font-weight` from body text entirely. Only the shiny `<tspan>` carries inline `font-weight="bold"`.

### Font-size in attribute form

`font-size="N"` as an attribute, never `style="font-size:Npx"`. Same visual result, one fewer syntactic hop for strippers that drop `style=""`.

### Background paint fallback

The background `<rect>` fill uses SVG paint-fallback syntax:

```xml
<rect width="420" height="420" fill="url(#bg) hsl(h,s%,l%)"/>
```

When `<defs>` survives, `url(#bg)` paints as-is. When `<defs>` is stripped, the renderer falls back to the inline HSL — the short-arc hue midpoint between the two gradient stops at average saturation and lightness. The 180° edge case is deterministic and unreachable from current renderer math.

### `textLength` pinning

Three chrome lines carry `textLength="388" lengthAdjust="spacingAndGlyphs"` (388 = 420 viewBox − 16 × 2 margin):

- Top rule (`y=82`)
- Bottom rule (`y=372`)
- Footer stats (`y=398`)

Natural width matches 388 under our on-chain font, so the adjust is a no-op in rich mode. Under substitute monospace (Menlo, Consolas), the browser compresses horizontally so the line stays inside the viewBox — slightly condensed but readable. The prompt, title, and sprite rows are intentionally unpinned — pinning shorter content would stretch it into ugly gaps.

### Chrome `font-size` placement

Chrome `<text>` carries `font-size="18"` directly (not hoisted) because chrome and sprite sizes differ. Hoisting onto the per-frame `<g>` is sprite-only.

## Rendering surfaces

Different viewers take different paths. The mitigations above are picked against the observed surface set:

| Surface | Path | Animation? |
|---|---|---|
| OpenSea (gallery + detail) | re-hosts SVG via `raw2.seadn.io` CDN; loaded in `<img>` secure animated mode | yes |
| Twitter/X, Discord, Etherscan unfurls | rasterize to PNG on their own infrastructure; capture t=0 | no — by design; `visibility="hidden"` pins frame 0 |
| Direct browser load | `<img src="data:image/svg+xml;base64,…">`; SVG-in-image secure animated mode | yes |
| Mobile wallets (MetaMask Mobile, Rainbow Mobile, Trust) | usually fail to render base64 `data:application/json` token URIs at all — not an animation regression | NFT typically fails to render; animation aside |

Mobile wallet rendering is structurally unreliable for this NFT shape. Target surfaces are OpenSea and direct browser loads; mobile wallet display is not a target.

## tokenURI extraction

```bash
# decode an on-chain token URI by hand
cast call <BuddyNFT> 'tokenURI(uint256)(string)' <id> --rpc-url <url> \
  | sed -n 's/^"\(.*\)"$/\1/p' \
  | sed 's|^data:application/json;base64,||' \
  | base64 -d
```

`cast call` wraps the returned string in literal double quotes — strip them before base64-decoding. The output JSON's `image` field is `data:image/svg+xml;base64,<…>` which decodes to the full animated SVG.

## File map

- Renderer contract: `onchain/contracts/BuddyRenderer.sol`
- Sprite data: `onchain/contracts/BuddySpriteData.sol`
- Font contracts: `onchain/contracts/BuddyFont.sol`, `onchain/contracts/BuddySpriteFont.sol`
- Sprite source + generator: `onchain/contract-data/sprites/`
- Reference cards (visual smoke): `onchain/contract-data/reference-cards/`
- Tests: `onchain/test/BuddyRenderer*.t.sol`, `onchain/test/BuddySpriteData.t.sol`

See `docs/onchain/contract.md` for the hatch flow and `docs/onchain/derivation.md` for trait derivation.

# Buddies Sprite Calculations

Reference for sprite geometry math. Lives next to `buddies-source.mjs`. Renderer integration is in `BuddyRenderer.sol`.

---

## 1. Storage grid

Every sprite is stored on a fixed grid:

- 18 species × 3 frames × 5 rows × **17 UTF-8 bytes** per body row
- 8 hats × **13 UTF-8 bytes** per hat row
- Eye sentinel: literal ASCII `0` byte inside body rows. 1 byte, 1 visible column. Substituted with the active eye glyph at render time.
- Forbidden in hat rows (hats carry no eyes).

Multi-byte glyphs eat the byte budget. `´` (U+00B4) and `ω` (U+03C9) are 2 bytes each. The allowed non-ASCII set is enforced by `gen-sprite-data.mjs:ALLOWED_NON_ASCII`.

---

## 2. Horizontal centering — frame 0 only

The generator computes ONE horizontal shift for each species from frame 0 and applies it to all 3 frames. Frame 0 is the authority; frames 1 and 2 must absorb the same shift or generation fails loudly.

### Algorithm

1. Tokenize all 5 rows of frame 0 into visible columns (space = empty token; `0` eye sentinel = 1 column; every other codepoint = 1 column).
2. Compute the visible bbox: `bboxLeft` = leftmost non-space column, `bboxRight` = rightmost non-space column, across rows 0-4.
3. `bboxWidth = bboxRight - bboxLeft + 1`
4. `targetLeft = ceil((17 - bboxWidth) / 2)` — `ceil()` biases parity ties one column right.
5. `desiredShift = targetLeft - bboxLeft`
6. Apply `desiredShift` to all 15 rows of the species (3 frames × 5 rows).
7. If any frame's row lacks the leading or trailing space slack to absorb `desiredShift`, the generator throws.

### Worked example — duck

Frame 0 of duck:

```
row 0: "                 "    blank
row 1: "       __        "    cols 7..8     (width 2)
row 2: "     <(0 )___    "    cols 5..12    (width 8)
row 3: "      (  ._>     "    cols 6..11    (width 6)
row 4: "       `--´      "    cols 7..10    (width 4)
```

Bbox across frame 0: `bboxLeft = 5`, `bboxRight = 12`, `bboxWidth = 8`.
`targetLeft = ceil((17 - 8) / 2) = ceil(4.5) = 5`.
`desiredShift = 5 - 5 = 0`. Duck is already centered — no shift applied.

### Why frame 0 only

Frames 1 and 2 are pose variations that ride along with frame 0's center. Letting them pull the shared shift would make the body wobble between frames during animation. The exact-shift rule trades authoring flexibility for visual stability.

Practical effect: the authored sprites in `buddies-source.mjs` are pre-centered, so the generator's shift is `0` for every species today. The math is defensive against future authoring drift.

---

## 3. Vertical row-0 reservation — all frames

The renderer reserves space for row 0 (the "hat slot") whenever it is potentially used. Whether to reserve depends on a per-species predicate that scans **all** frames.

### Predicate

A species needs the full 5-row vertical band if **any** of these hold:

- A hat is present (`traits.hat != 0`) — the hat occupies row 0.
- ANY frame (0, 1, or 2) has non-blank row 0 — body anatomy or an emote uses the slot.

A species can collapse to a 4-row visual band only when **both** conditions hold:

- `traits.hat == 0` (hatless)
- All 3 frames have a blank row 0

### Encoding

The generator emits a per-species bitmap into `BuddySpriteData.sol`:

```solidity
uint32 public constant BODY_USES_ROW_0 = 0x000174B0;
```

Bit `i` is set if species `i` uses row 0 in any frame. The renderer reads the bit and decides whether to render at full 5-row height or compress to a 4-row band.

### Species split

| Behavior | Species (index) | Row-0 content |
|---|---|---|
| **Always 5-row** (uses row 0 in some frame; bit set) | dragon (4), octopus (5), penguin (7), ghost (10), capybara (12), cactus (13), robot (14), mushroom (16) | dragon `~    ~` (frame 2), octopus `o`, penguin shifts whole body up, ghost `~  ~`, capybara `~  ~`, cactus `n        n` (arms grow), robot `*` (spark), mushroom `. o  .` (spores) |
| **4-row eligible** (all-blank row 0; bit clear) | duck (0), goose (1), blob (2), cat (3), owl (6), turtle (8), snail (9), axolotl (11), rabbit (15), chonk (17) | always blank |

Bitmap derivation: bits 4, 5, 7, 10, 12, 13, 14, 16 set → `0x174B0`.

### Visual outcome

The renderer keeps row 0 as a `<text>` element either way; the difference is the gap to row 1.

```
Full 5-row (halfHeightTopSlot = false)        4-row band (halfHeightTopSlot = true)
y=125  row 0  ←─ hat or emote slot            y=125  row 0  ←─ blank, structurally reserved
       (50 px gap)                                    (25 px gap, "half height")
y=175  row 1                                  y=150  row 1
y=225  row 2                                  y=200  row 2
y=275  row 3                                  y=250  row 3
y=325  row 4                                  y=300  row 4
```

Constants live in `BuddyRenderer.sol`:

- `SPRITE_ROW_0_BASELINE = 125`
- `SPRITE_ROW_GAP = 50`
- `HATLESS_TOP_SLOT_GAP = SPRITE_ROW_GAP / 2 = 25`

### Why all frames, not frame 0 only

The renderer reads only frame 0 today, but with animation it will cycle through all 3 frames. If we sized the band from frame 0 alone, dragons (and the other 7 row-0-using species) would render with a compressed top gap; when frame 2 played, the `~    ~` emote would land at y=125 with only 25 px of clearance, crowding the body row at y=150. Reserving the full slot up-front keeps row spacing visually consistent across all frames.

### Worked examples

**Hatless duck** — `BODY_USES_ROW_0` bit 0 = 0; `traits.hat == 0` → halfHeightTopSlot = true. Body renders compressed: blank row 0 at y=125, content at y=150/200/250/300.

**Duck with crown** — `traits.hat != 0` → halfHeightTopSlot = false regardless of bitmap. Crown at y=125, content at y=175/225/275/325.

**Hatless dragon** — `BODY_USES_ROW_0` bit 4 = 1 → halfHeightTopSlot = false even when hatless. Body renders at full 5-row spacing; row 0 sits ready for the frame-2 `~    ~` emote.

**Dragon with crown** — both conditions force full height. Crown at y=125 in frames 0/1; in frame 2 the renderer's hat-substitution gate skips because row 0 is non-blank, so the `~    ~` emote replaces the crown for that one tick. This is the canonical "hat flicker" behavior.

---

## 4. Hat composition

Hats live in their own 13-byte storage slot, then get composed into a 17-byte body row at render time.

### Generation-time hat centering

Each hat is centered inside its 13-byte slot using the same bbox + ceil tie-break math as bodies. A hat too wide to fit fails generation.

### Render-time pad

`BuddyRenderer.sol::_renderSpriteRow` substitutes the hat into row 0 when `traits.hat != 0` AND the species's frame 0 row 0 is blank:

```solidity
rawRow = string.concat("  ", spriteData.getHatRow(traits.hat), "  ");
```

The fixed `2 leading + 2 trailing` spaces lift the 13-byte hat row to 17 bytes. Combined with the 13-col centering, the hat's content-center lands at column 8 of the 17-col body slot — same as body content-center.

### Hat-substitution gate (canonical flicker)

The substitution check at `BuddyRenderer.sol:429` is:

```solidity
if (row == 0 && traits.hat != 0 && _isBlankRow(rawRow)) { … }
```

For the 8 row-0-using species, frame 2's row 0 is NON-blank — so hat substitution is skipped for frame 2 only. Hat appears in frames 0 and 1; frame 2 shows the species's row-0 content (emote or body anatomy) for one tick. This is canonical Claude Code behavior preserved on chain.

---

## 5. Visible viewport envelope

For card layout, three "sizes" are worth keeping separate:

| Size | Dimensions | Use |
|---|---|---|
| Storage grid | 17 cols × 5 rows | byte-stable slot the renderer reads |
| Largest individual visible bbox | 12 × 5 (with hat row) or 12 × 4 (body-only frame 0) | max ink for any single sprite |
| **Shared viewport envelope** | **14 cols × 5 rows** | union across all species, all frames, all hats — use this for card zoning |

The 14×5 envelope is not a hat-only edge case: several species' frame-1 / frame-2 poses also reach row 0, so the all-frames body envelope is also 14×5.

Practical takeaway: treat the sprite's stable play area as 14 cols × 5 rows; do **not** zone against the full 17-col storage slot if optical centering matters.

---

## 6. Background circle drift

Three decorative background circles (already per-token-unique via PRNG `cx`/`cy`/`radius`/`hue`) gain a slow continuous drift via CSS `@keyframes` + `transform: translate()`. Fills the dead time between 500 ms sprite ticks so the card reads as ambient-continuous rather than punctuated-stillness.

### 6.1 Prime period pool

Each circle's period (seconds) is pulled from a coprime prime pool. All primes are deliberately outside the 7.5 s / 15 s / 22.5 s harmonic bands of the sprite cycle so drift motion never falls into visible lockstep with sprite fidgets.

```
PRIMES = (29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71)
```

Three primes are sampled without replacement per card, so the three circles in a single card always have distinct periods. LCM of any 3 primes from the pool is their product — e.g. 29·31·37 ≈ 33,263 s ≈ 9 hours. Motion is effectively non-repeating for any plausible viewing session.

A faster debug pool `(3, 5, 7, 11, 13, 17, 19, 23)` is available via the `FAST` toggle in `tools/renderer/inject-circle-drift.py`. Debug only — mainnet ships the slow pool with the toggle stripped.

### 6.2 Per-token derivation — no new PRNG rolls

Each circle's period and phase offset derive deterministically from that circle's own `cx` and `cy`, which are already per-token-unique from the Mulberry32 seed. No additional rolls, no new storage.

For circle index `i ∈ {0, 1, 2}`:

```
mix     = ((cx * 73856093) ^ (cy * 19349663) ^ (i * 83492791)) & 0xFFFFFFFF
period  = pool_remaining[mix % len(pool_remaining)]   // sampled without replacement
delay   = (mix >> 8) % period
```

The multipliers are the three large-prime constants from Teschner et al. 2003 ("Optimized Spatial Hashing for Collision Detection of Deformable Objects"), commonly used for 3D spatial hashing of small integer inputs. `cx` and `cy` live in `[0, 420)`, so small arithmetic deltas need spreading to avoid clumping in the low bits of `mix`. These exact decimal values MUST match what the reference Python injector at `tools/renderer/inject-circle-drift.py` uses — that injector generated the canonical visual baseline. Do not substitute different "equivalent" hash multipliers.

Delay enters CSS as a **negative** `animation-delay` (`animation-delay: -Ns`), which starts the circle mid-cycle. Without this, every circle would begin at its translate-(0, 0) origin and the three circles in a card would visibly launch from the same spot at load time.

### 6.3 Waypoint shapes — three fixed closed loops

Three pre-baked translation paths are shared across all tokens. Circle `i` uses shape `i mod 3` — no per-token shape variation. Per-token variety comes from period and phase, not shape. All shapes close the loop (`0% == 100%`) so there is no visible snap at wraparound.

Amplitudes are capped at ≤ 18 px so circles near the canvas edge (`cx` close to 0 or 420) stay on-canvas at all points along the path.

**Shape A — `drift0`** (clockwise-ish ellipse, 4 waypoints):

```
  0%  translate(  0px,   0px)
 25%  translate( 18px,  -8px)
 50%  translate( 14px,  16px)
 75%  translate( -6px,  12px)
100%  translate(  0px,   0px)
```

**Shape B — `drift1`** (figure-eight, 5 waypoints, crosses origin):

```
  0%  translate(  0px,   0px)
 20%  translate(-14px, -10px)
 40%  translate( 12px, -14px)
 60%  translate(-10px,  10px)
 80%  translate( 14px,   8px)
100%  translate(  0px,   0px)
```

**Shape C — `drift2`** (lazy triangle, 3 waypoints):

```
  0%  translate(  0px,   0px)
 33%  translate( 10px, -14px)
 66%  translate(-12px,  -8px)
100%  translate(  0px,   0px)
```

### 6.4 Timing function — `ease-in-out`

All three animations use `ease-in-out`. Browser interpolates a smooth curve between waypoints; soft deceleration at each waypoint reads as organic, non-linear motion without requiring `sin`/`cos` math in Solidity.

Deliberately NOT `step-start` (the sprite's timing function). Sprite motion is discrete; background motion is continuous. The two different motion grammars are an accepted design choice — "character discrete, world continuous" — documented in the deviation-acceptance entry alongside shiny and compressed-top.

### 6.5 Degradation — safe by construction

`cx`/`cy` remain SVG attributes on `<circle>`; `transform` only adds a delta. If `transform` never evaluates (CSS animation unsupported, `<style>` stripped, external rasterizer capturing t = 0), circles render statically at `cx`/`cy`. No "missing transform → off-canvas" failure mode is possible.

Specific fallback paths:

| Scenario | Circle behavior | Matches sprite fallback? |
|---|---|---|
| Renderer ignores `@keyframes` | static at baseline | — |
| Renderer ignores `transform` on SVG (historical Safari pre-2017) | static at baseline | — |
| `<style>` stripped (see `docs/onchain/renderer.md` § Stripping fallbacks) | static at baseline | yes — font + sprite also fall back |
| External rasterizer captures t = 0 (Twitter/Discord/Etherscan) | at baseline `cx`/`cy` | yes — sprite captured at frame 0 via `visibility="hidden"` |
| Mobile wallet fails animated SVG (see `docs/onchain/renderer.md` § Rendering surfaces) | whole NFT fails to render | yes — not a new regression |

### 6.6 Size cost

| Surface | Delta |
|---|---|
| Runtime SVG payload per token | ~+800 B (3 `@keyframes` blocks ≈ 540 B + 3 `#cN` rules ≈ 210 B + 3 `id="cN"` attributes ≈ 30 B) |
| Base64-inflated tokenURI JSON | ~+1,070 B |
| Contract bytecode | ~+1,340 B |
| Per-token variation over fixed-period variant | +~20 B SVG, +~200 B bytecode |

Current `BuddyRenderer` runtime: 18,302 B. EOA cap: 24,576 B. Margin today: 6,274 B. After promotion: ~4,934 B. Not tight. The +1,340 B figure accounts for per-token machinery (`_driftMix`, `_driftRule`, `_driftRulesCss`) on top of the keyframe blocks.

### 6.7 Cross-reference

- Post-processing injector (eval-only, does NOT touch `BuddyRenderer.sol`): `tools/renderer/inject-circle-drift.py`

---

## 7. Testing

The calculation rules in §1–§5 are locked by tests at three layers: the sprite-data contract, the renderer contract, and the generator's own self-check. Each test is described below in plain English — what it pins, why we picked the species used as the example, and (for the renderer matrix) what the buddy will look like during play once animation lands.

### 7.1 Test layers — quick map

| Layer | File | What it owns |
|---|---|---|
| Sprite-data contract | `onchain/test/BuddySpriteData.t.sol` | `BODY_DATA` byte layout, lock-row centering pins, `BODY_USES_ROW_0` bitmap correctness |
| Renderer contract | `onchain/test/BuddyRenderer.t.sol` | Row y-coordinate emission, half-height predicate behavior, chrome rail composition |
| Generator self-check | `onchain/contract-data/sprites/tools/gen-sprite-data.mjs::selfCheck()` | Centering math, glyph validation, bbox bbox/shift fixtures, bitmap derivation |
| Visual smoke | `onchain/tools/renderer/renderer-card.sh` | End-to-end SVG render for human eyeballing (not a pass/fail gate) |

### 7.2 Sprite-data tests (`BuddySpriteData.t.sol`)

#### Shape and width

- **`test_bodyCorpus_contains270Rows`** walks every (species, frame, row) triple and counts. 18 × 3 × 5 = 270. Catches accidental dimension changes (e.g. someone bumps `FRAME_COUNT` without updating storage).
- **`test_bodyRows_allAre17Bytes`** asserts every body row is exactly 17 UTF-8 bytes. The byte budget is load-bearing: `_slice` indexes by byte. A row that's 16 or 18 bytes would silently misalign every subsequent row in the packed blob. Multi-byte glyphs (`´`, `ω`) eat 2 bytes each — this test guarantees the source author paid attention.
- **`test_hatRows_allAre13Bytes`** same invariant for the 13-byte hat slot.
- **`test_bodyRows_expectedRowsPreserveEyeSentinel`** spot-checks that rows known to contain `0` (eye sentinel) still do. Catches a regression where someone substitutes the eye glyph at generation time instead of leaving the sentinel for the renderer.

#### Horizontal centering — lock-rows (`test_bodyRows_lockSpeciesOrder`)

Each species has one frame-0 row pinned to its expected post-centering byte signature. The leading and trailing space counts in each pinned string are **the centering result** — they prove the generator's exact frame-0-derived shared shift produced the right output for that species.

Example pin: `assertEq(spriteData.getBodyRow(2, 0, 1), "      .----.     ");`

This is blob (species 2), frame 0, row 1. Six leading spaces + content + five trailing spaces. The unequal split (6 vs 5) is the **ceil tie-break** in action: `ceil((17 - 6) / 2) = 6`. The bbox-width-6 content lands one column right of geometric center. If somebody later changes the bbox math to use `floor` instead of `ceil`, this assertion flips to "five leading + six trailing" and the test fails loudly.

The 18 lock-rows together cover:
- Even-width content (e.g. duck, where bbox width is even and split is symmetric)
- Odd-width content with ceil right-bias (e.g. blob, axolotl, capybara, cactus, chonk — marked `(+3)` etc. in inline comments showing the per-species shared shift magnitude)
- Multi-byte glyphs (`´` in dragon, `ω` in cat) — pinned via raw UTF-8 escapes (`\xc2\xb4`, `\xcf\x89`) to verify byte-count math survives encoding
- Eye sentinel preservation (`0` characters in duck and axolotl pins)

What this catches: if anyone reorders SPECIES_ORDER, edits a sprite row in `buddies-source.mjs` without rerunning the generator, or breaks centering math, exactly the affected pin fails with a diff showing the real vs expected bytes.

#### Hat centering — lock-rows (`test_hatRows_lockHatOrder`)

Same pattern for hats. Each of 8 hats is pinned to its post-centering 13-byte string. Wizard hat: `"     /^\\     "` — 5 leading + 3 content + 5 trailing. None hat: 13 spaces (centering of nothing is a no-op).

What this catches: hat reorder, hat content edit without regeneration, hat centering math regression.

#### Bitmap tests — `BODY_USES_ROW_0`

- **`test_BodyUsesRow0_bitmapValue`** asserts the constant equals `0x000174B0`. This is the integer that encodes which 8 species use row 0 in any frame. Hardcoded value catches any change: if a future sprite edit accidentally clears row 0 in a frame for one of the 8 species (or fills row 0 in a previously-blank species's frame), this assertion fails immediately. The hex value carries the full predicate state in 4 bytes.
- **`test_BodyUsesRow0_bitsSetForRow0UsingSpecies`** asserts `bodyUsesRow0(s) == true` for s ∈ {4, 5, 7, 10, 12, 13, 14, 16}. These are dragon, octopus, penguin, ghost, capybara, cactus, robot, mushroom — the 8 species that paint something at row 0 in some frame (frame 2 in every case today). Each species is asserted individually so a failure message names the offender.
- **`test_BodyUsesRow0_bitsClearForBlankRow0Species`** asserts `bodyUsesRow0(s) == false` for s ∈ {0, 1, 2, 3, 6, 8, 9, 11, 15, 17}. The 10 species with a permanently blank row 0 across all frames: duck, goose, blob, cat, owl, turtle, snail, axolotl, rabbit, chonk.
- **`test_BodyUsesRow0_outOfBoundsReverts`** asserts `bodyUsesRow0(18)` reverts with `InvalidBodyIndex`. The bitmap is logically 18 bits wide but stored in `uint32`; without a bounds check, calling with `species = 18` would read bit 18 (always 0) and return false silently. Guard against that misuse.

### 7.3 Renderer y-coordinate tests (`BuddyRenderer.t.sol`)

The half-height predicate has 2 inputs (hat present or not, species uses row 0 or not) and therefore 4 cases. Each test renders a representative buddy, decodes the SVG, and asserts which y-coordinate slots get a sprite text element.

#### Case 1 — `test_RowHeights_hatlessDuck_halfHeight`

**Buddy:** species=0 (duck), hat=0 (none), default rarity/eyes/stats.
**Predicate:** `(hat == 0) && !bodyUsesRow0(0)` → `true && !false` → **true** → compressed top.
**Asserted y-coords present:** 125, 150, 200, 250, 300.
**Asserted y-coords ABSENT:** 175, 225 (would indicate full-5-row layout had been picked instead).

Visual outcome:
```
y=125  (blank — duck has no hat and no frame uses row 0, but the slot is still emitted as a text element)
y=150  (25px gap above; first visible row sits closer to top)
       __        ← duck's beak top
y=200       <(✦ )___    ← duck head + eye + cheek (eye glyph depends on rarity roll; ✦ shown for example)
y=250         (  ._>    ← duck body
y=300          `--´     ← duck tail
```

What you'd see during play: the entire 7.5s cycle stays in this compressed layout. Frame 1 (slight cheek puff `~` at end of row 4), frame 2 (closed beak `__>` instead of `._>`), and blink (eyes swap to `-`) all land at the same y-coords. Row 0 stays blank in every frame because duck never uses it.

What this catches: if the predicate ever returns false for a 4-row eligible hatless species, the buddy renders 25px lower than it should (sitting at y=175 instead of y=150), and one of the `assertFalse(... y="175"...)` checks fires.

#### Case 2 — `test_RowHeights_hattedDuck_fullHeight`

**Buddy:** species=0 (duck), hat=1 (crown).
**Predicate:** `(hat == 0) && ...` → first conjunct is false → **false** → full 5-row.
**Asserted y-coords present:** 125, 175, 225, 275, 325.
**Asserted y-coords ABSENT:** 150, 200.

Visual outcome:
```
y=125     \^^^/         ← crown (substituted into duck's blank row 0 by the hat-substitution gate at BuddyRenderer.sol:429)
y=175       __          ← duck beak (50px gap, full row pitch)
y=225     <(✦ )___      ← duck head
y=275       (  ._>      ← body
y=325        `--´       ← tail
```

What you'd see during play: hat sits stable on row 0. Frames 0/1/2 are duck's own variations (no row-0 changes since duck has blank row 0 in all frames). The hat-substitution gate works for all three frames because frame N row 0 is always blank for duck. No flicker.

What this catches: if the predicate ever returns true when a hat is present, the hat would render at y=125 with rows below at y=150/200/250/300 (compressed) — looking visually correct in single-frame mode but failing to match the rest of the system's "any hat = full 5-row" rule.

#### Case 3 — `test_RowHeights_hatlessDragon_fullHeight`

**Buddy:** species=4 (dragon), hat=0 (none).
**Predicate:** `(hat == 0) && !bodyUsesRow0(4)` → `true && !true` → **false** → full 5-row.
**Asserted y-coords present:** 125, 175, 225, 275, 325.
**Asserted y-coords ABSENT:** 150 (would indicate the predicate was still using frame-0-only blankness check).

Visual outcome:
```
y=125  (blank in frame 0 — but RESERVED because frame 2 will fill it with `~    ~`)
y=175       /^\  /^\        ← dragon's two horns
y=225      <  ✦  ✦  >       ← eyes (eye glyph from rarity roll)
y=275      (   ~~   )       ← mouth with breath
y=325       `-vvvv-´        ← chin + scales
```

What you'd see during play:
- ~80% of cycle (frame 0): looks exactly like the snapshot above
- 1 tick (frame 1): mouth changes to `(        )` — empty/relaxed
- 1 tick (frame 2): **`~    ~` nostril breath emote appears at y=125** with proper 50px clearance to horns at y=175 — this is exactly what the row-0 reservation buys us
- 1 tick (blink): eyes `✦` swap to `-`

This is the load-bearing case for the whole row-0 reservation feature. Pre-feature: hatless dragon rendered at y=125 blank / y=150/200/250/300, leaving only 25px above the horns. When frame 2 played, the nostril breath would have been crammed against the horns. Post-feature: 50px clearance, animation reads cleanly.

What this catches: if `bodyUsesRow0(4)` ever returns false (sprite edit removed dragon's frame-2 row-0 content, or bitmap regenerated with wrong predicate), this test catches it via the `assertFalse(... y="150"...)` check — the renderer would fall back to compressed mode and the assertion fires.

#### Case 4 — `test_RowHeights_hattedDragon_fullHeight`

**Buddy:** species=4 (dragon), hat=1 (crown).
**Predicate:** both inputs false-out → **false** → full 5-row (same y-coords as case 3).
**Asserted y-coords present:** 125, 175, 225, 275, 325.

Visual outcome (frame 0):
```
y=125     \^^^/             ← crown
y=175       /^\  /^\        ← horns
y=225      <  ✦  ✦  >       ← eyes
y=275      (   ~~   )       ← mouth
y=325       `-vvvv-´        ← chin
```

What you'd see during play (the canonical hat-flicker behavior):
- Frames 0 and 1: crown sits on row 0 normally (duck-hatted-style stable)
- Frame 2: **crown momentarily disappears**, replaced by `~    ~` nostril breath for one tick (~500ms)
- Frame 0 returns: crown is back

The substitution gate at `BuddyRenderer.sol:429` checks `_isBlankRow(rawRow)` per-frame at render time. For frame 2's non-blank row 0, the hat substitution is skipped — the dragon's own row-0 content wins. This is the deliberate Claude Code preservation behavior — Alice's crowned dragon momentarily snorts the crown aside and we keep that quirk on chain.

What this catches: same predicate validation as case 3, plus indirect coverage that hatted dragons' y-coords match hatless dragons' y-coords (identical 5-row layout).

#### Adjacent test — `test_tokenURI_emitsRailPromptTitleSpriteAndFooter`

Not strictly a row-height test, but exercises the chrome rail worst-case (mushroom species 16, shiny + legendary, longest title path: `✦SHINY✦ LEGENDARY │ MUSHROOM │ HATCHED`). Mushroom is one of the 8 row-0-using species, so its sprite y-coords are pinned at the full-5-row positions (y=125 reserved blank, y=175/325 visible content). This proves the row-0 reservation works end-to-end through the full token URI pipeline, not just the isolated `_spriteSurface` path.

### 7.4 Generator self-check (`gen-sprite-data.mjs::selfCheck()`)

Every generator run executes `selfCheck()` before reading source. Failures abort with non-zero exit. The fixtures are deliberately small synthetic inputs designed to exercise the centering and bitmap helpers without depending on the real sprite data.

#### Width fixtures

Six fixtures at the top of `selfCheck`:
- 17-byte ASCII blank → expected pass
- 17-byte row with reserved `0` eye sentinel → expected pass
- 17-byte row with multi-byte `´` (which counts as 2 bytes despite occupying 1 visible column) → expected pass
- 16-byte and 18-byte rows → expected fail (one short / one long)
- Lone `{` and `}` → expected pass (no longer brace-based eye tokens to confuse)

Catches: byte-width regressions in the row validation logic.

#### Glyph rejection fixture

Fires `validateGlyph` against `\u2603` (snowman) — a codepoint NOT in `ALLOWED_NON_ASCII`. Expected to throw `GenError` with "disallowed glyph" in the message. Catches: validation passing when it shouldn't, or message format drift that would break diagnostic readability.

#### Centering bbox fixture

Synthetic 5-row frame with content at columns 2..9 (bbox width 8). Asserts:
- `bboxLeft == 2`, `bboxRight == 9` (bbox detection)
- `desiredShift == 3` (math: `targetLeft = ceil((17-8)/2) = 5`, shift = 5 - 2 = 3)
- After `applyShift`, every row is exactly 17 bytes (conservation of byte count)

Catches: bbox detection bugs, off-by-one in shift math, byte loss during shift application.

#### Ceil tie-break fixture

Single-row frame with bbox width 3 at cols 5..7. Asserts:
- `desiredShift == 2` because `targetLeft = ceil((17-3)/2) = ceil(7) = 7`, and 7 - 5 = 2

Catches: someone changing `Math.ceil` to `Math.floor` or `Math.round` would shift the result by 1 column on odd-width content. Failing this fixture is the canary for parity-tie behavior changes.

#### Impossible shared shift fixture

3-frame synthetic where frame 1 is `XXXXXXXXXXXXXXXX ` (16 X's, 1 trailing space) — frame 1 row 1 lacks the leading-space slack to absorb a `+2` right shift derived from frame 0. Asserts `centerSpecies` throws. Catches: silent clamping (frame 0's ideal center being abandoned because a later frame can't absorb the shift) — we want loud failures so the source art gets fixed instead.

#### Overflow shift fixture

Tries `applyShift("X                ", 100, ...)` — shift is way too large. Asserts throw. Catches: the row-level shift validator missing its boundary check.

#### Bitmap derivation fixture

4 synthetic species, only species `b` (index 1) and `d` (index 3) have non-blank row 0 in some frame. Expected bitmap = `0b1010` = 10. Catches: bit-shift errors, off-by-one in species iteration, mistakenly checking a row other than row 0.

### 7.5 Visual smoke (`onchain/tools/renderer/renderer-card.sh`)

Not a pass/fail gate — outputs SVG for human inspection. Useful for spotting visual regressions the structural assertions miss (font kerning shifts, accidental color changes, viewBox math errors). Committed byte-deterministic snapshots live at `onchain/contract-data/reference-cards/` as a human-eyeball showroom for side-by-side comparison.

Available presets:

| Preset | Species | Hat | Notable property |
|---|---|---|---|
| `duck` | duck (0) | none (0) | 4-row eligible hatless — exercises compressed-top mode |
| `axolotl` (default) | axolotl (11) | varies | 4-row eligible, multi-byte glyphs in body, literal `{` `}` |
| `dragon` | dragon (4) | wizard (5) | row-0-using + hatted — exercises full 5-row + hat-substitution gate |
| `robot` | robot (14) | varies | row-0-using species |
| `mushroom` | mushroom (16) | none (0) | row-0-using + hatless + shiny + legendary — chrome worst case AND visible row-0 reservation |
| `single` / `hundred` | duck variants | varies | trait values 1 and 100 — chrome rail width edge cases |

Recommended smoke targets after any change touching sprite or renderer math:
- `bash onchain/tools/renderer/renderer-card.sh mushroom` — verify row-0 reservation visually (blank slot above mushroom cap)
- `bash onchain/tools/renderer/renderer-card.sh dragon` — verify hat substitution + full-5-row layout
- `bash onchain/tools/renderer/renderer-card.sh duck` — verify compressed-top still works for 4-row eligible

The script overwrites its output dir on each run, so render one preset at a time when comparing.

---

## 8. Cross-references

- Authored source: `onchain/contract-data/sprites/buddies-source.mjs`
- Generator: `onchain/contract-data/sprites/tools/gen-sprite-data.mjs`
- Diagnostic: `onchain/contract-data/sprites/tools/sprite-audit.mjs`
- Generated runtime bytes: `onchain/contracts/BuddySpriteData.sol`
- Renderer integration: `onchain/contracts/BuddyRenderer.sol::_spriteSurface`
- Reference cards (showroom): `onchain/contract-data/reference-cards/`

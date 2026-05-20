# Canonical Reference Cards

**Status:** Reference (as-built)
**Mirrors:** `onchain/script/GenerateReferenceCards.s.sol`, `onchain/tools/renderer/regen-reference-cards.sh`

Committed, byte-deterministic SVG output from `BuddyRenderer.tokenURI`, covering one card per rarity tier with alternating hat / hatless state. Permanent visual-truth snapshots that other docs, skills, and surfaces can reference instead of regenerating scratch artifacts on every check.

## Suite

| File | Rarity | Species | Hat state | Why it's here |
|---|---|---|---|---|
| `common-duck-hat.svg` | Common | Duck | Beanie | Baseline 4-row species, hat rendering |
| `uncommon-mushroom-hatless.svg` | Uncommon | Mushroom | Hatless | Row-0 reservation edge, canonical hatless species |
| `rare-axolotl-hat.svg` | Rare | Axolotl | Tophat | Mid-rarity chrome, bullseye eyes |
| `epic-dragon-hat.svg` | Epic | Dragon | Wizard | Full 5-row layout, highest stat bar |
| `legendary-ghost-hatless.svg` | Legendary | Ghost | Hatless + Shiny | Legendary chrome + shiny glow |

Trait tuples, identity hashes, and stage values are pinned in `GenerateReferenceCards.s.sol` — regeneration is byte-identical as long as the renderer, sprite data, and font artifacts are unchanged.

Each card ships as a pair:

- `<slug>.svg` — the fully self-contained SVG the contract would embed (base64 woff2 fonts inline).
- `<slug>.json` — the ERC-721 metadata JSON exactly as emitted by `tokenURI`, pretty-printed, with the `image` data URI rewritten to a relative `./<slug>.svg` pointer so marketplaces-facing attributes stay readable without re-embedding the full SVG payload.

## Regeneration

```bash
bash onchain/tools/renderer/regen-reference-cards.sh
```

Runs `forge script` in the in-memory EVM (no Anvil, no deploy), decodes each `tokenURI` response, and overwrites the five `.svg` files in this directory.

## Regeneration discipline

Regenerate and commit the diff whenever any of the following change:

- `onchain/contracts/BuddyRenderer.sol` (or anything it calls)
- `onchain/contracts/BuddySpriteData.sol` (regenerated from `onchain/contract-data/sprites/buddies-source.mjs`)
- Font artifacts under `onchain/contract-data/fonts/`

A non-trivial diff on a commit that did not intend a visual change is the signal that a regression landed and needs human review. Treat this suite as the renderer's visual contract — the PR description should explain any intentional visual shift.

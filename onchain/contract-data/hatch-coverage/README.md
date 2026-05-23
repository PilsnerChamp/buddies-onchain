# Hatch Coverage

**Status:** Regression gate (as-built)
**Mirrors:** `onchain/script/CheckHatchCoverageUuids.s.sol`, `onchain/tools/renderer/regen-hatch-coverage-uuids.sh`, `onchain/test/helpers/HatchCoverageUuids.sol`, `onchain/test/BuddyNFTHatchCoverage.t.sol`

Committed manifest for the `hatch-coverage` suite. This is axis-value coverage, not a coverage matrix: one UUID per axis value where practical, covering species, rarity, eyes, hats, shiny, and hatless state without Cartesian or pairwise expansion. The gate has two parts: Solidity re-derives UUID → seed → traits from `manifest.json`, and the Foundry test walks the real hatch path `BuddyNFT.hatch(uuid)` → `tokenURI(tokenId)` with structural rendering assertions. No committed tokenURI/JSON/SVG byte fixtures live here.

## Suite contents

- `manifest.json` — canonical UUID order, `tokenId`, `seed`, and full `BuddyTraits` per UUID.

## Manifest fields

- `uuid` — canonical UUID string consumed by `BuddyNFT.hatch`.
- `tokenId` — canonical array index + 1. Reordering UUIDs is a fixture change.
- `seed` — `WyHash.hash(uuid, HATCH_SALT)`, equal to `BuddyNFT.buddyPrngSeed(tokenId)`.
- `traits.species` — derived species index.
- `traits.rarity` — derived rarity tier.
- `traits.eyes` — derived eye glyph index.
- `traits.hat` — derived hat index; `0` is hatless.
- `traits.shiny` — derived shiny flag.
- `traits.debugging` — derived debugging stat.
- `traits.patience` — derived patience stat.
- `traits.chaos` — derived chaos stat.
- `traits.wisdom` — derived wisdom stat.
- `traits.snark` — derived snark stat.

## Regeneration

```bash
# After PRNG, domain count, or HATCH_SALT changes:
just coverage-uuids-gen

# Every sprites-verify run:
just coverage-uuids-check
```

`coverage-uuids-gen` runs the Solidity UUID scanners, rewrites `onchain/test/helpers/HatchCoverageUuids.sol`, and rewrites `manifest.json`.

`coverage-uuids-check` re-derives `WyHash.hash(uuid, HATCH_SALT)` and `Mulberry32.deriveTraits(seed)` in Solidity, then checks seeds, full traits, and axis coverage.

`BuddyNFTHatchCoverage.t.sol` consumes the same canonical UUID list and manifest, hatches every UUID through the real `BuddyNFT`, checks stored seed + full traits, decodes `tokenURI`, and asserts JSON/SVG structure derived from manifest values.

## Regeneration discipline

Regenerate UUIDs when any of these change:

- `BuddyNFT.HATCH_SALT`
- `WyHash` or the UUID → seed pipeline
- `Mulberry32` trait derivation
- `BuddyDomain` trait counts

Do not rediscover UUIDs for renderer-only changes. Treat UUID order as canonical: changing order changes tokenIds and manifest semantics.

Renderer, sprite, or font changes are covered by structural assertions in `BuddyNFTHatchCoverage.t.sol` during `forge test`; update renderer tests or reference cards only when human review needs a curated visual example.

## Vs reference-cards

`../reference-cards/` is the human-eyeball showroom: curated trait combinations and screenshots for review. `hatch-coverage` is the machine regression gate for trait derivation plus structural rendering over the 22 real-hatch UUIDs. Both stay; they have different jobs.

## Coverage summary

Axis goals:

- 18 species
- 5 rarities
- 6 eye glyphs
- all non-zero hats
- at least one hatless UUID
- at least one shiny UUID
- at least one non-shiny UUID

UUID discovery uses the greedy axis cover emitted by `FindSpeciesUuids`. Unless that set already includes a `hat == 0` UUID, `coverage-uuids-gen` appends the first hatless UUID from the same `SEARCH_LIMIT = 10_000` range via `FindHatlessUuid`.

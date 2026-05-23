# Coverage and mutation tracking

## Status / date

Baseline captured 2026-05-22; Workstream F updated 2026-05-22; 247 tests, 21 suites.

Notes:
- `cd onchain && forge test` passes 247 tests across 21 suites.
- `forge coverage` disables optimizer settings, so `BytecodeSizeTest` and
  `GasCeilingsTest` skip under `VmSafe.ForgeContext.Coverage`; they remain active
  in normal `forge test` runs.
- The Foundry gas limit is raised so the renderer-heavy coverage tests complete
  under instrumentation.

## How to regenerate

```bash
cd onchain && forge coverage --report summary
```

## Baseline table

```text
Ran 21 test suites in 9.18s (73.28s CPU time): 235 tests passed, 0 failed, 2 skipped (237 total tests)

╭------------------------------------------+-------------------+-------------------+------------------+------------------╮
| File                                     | % Lines           | % Statements      | % Branches       | % Funcs          |
+========================================================================================================================+
| contracts/BuddyFont.sol                  | 100.00% (4/4)     | 100.00% (2/2)     | 100.00% (0/0)    | 100.00% (2/2)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddyFontPayload.sol           | 100.00% (14/14)   | 100.00% (13/13)   | 100.00% (2/2)    | 100.00% (4/4)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddyNFT.sol                   | 100.00% (144/144) | 100.00% (152/152) | 100.00% (26/26)  | 100.00% (27/27)  |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddyRenderer.sol              | 100.00% (336/336) | 100.00% (434/434) | 100.00% (81/81)  | 100.00% (56/56)  |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddySpriteData.sol            | 100.00% (21/21)   | 100.00% (29/29)   | 100.00% (3/3)    | 100.00% (4/4)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddySpriteFont.sol            | 100.00% (4/4)     | 100.00% (2/2)     | 100.00% (0/0)    | 100.00% (2/2)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/libraries/Mulberry32.sol       | 100.00% (58/58)   | 100.00% (70/70)   | 100.00% (14/14)  | 100.00% (6/6)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/libraries/WyHash.sol           | 100.00% (66/66)   | 100.00% (80/80)   | 100.00% (7/7)    | 100.00% (7/7)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/CheckHatchCoverageUuids.s.sol     | 0.00% (0/113)     | 0.00% (0/132)     | 0.00% (0/24)     | 0.00% (0/11)     |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/Deploy.s.sol                      | 50.00% (15/30)    | 59.52% (25/42)    | 50.00% (1/2)     | 66.67% (2/3)     |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/EmitHatchCoverageManifest.s.sol   | 0.00% (0/17)      | 0.00% (0/25)      | 0.00% (0/2)      | 0.00% (0/2)      |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/FindHatlessUuid.s.sol             | 0.00% (0/16)      | 0.00% (0/22)      | 0.00% (0/1)      | 0.00% (0/2)      |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/FindSpeciesUuids.s.sol            | 0.00% (0/76)      | 0.00% (0/90)      | 0.00% (0/15)     | 0.00% (0/6)      |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/GenerateReferenceCards.s.sol      | 0.00% (0/26)      | 0.00% (0/31)      | 100.00% (0/0)    | 0.00% (0/3)      |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/GenerateRendererCard.s.sol        | 0.00% (0/34)      | 0.00% (0/38)      | 0.00% (0/7)      | 0.00% (0/3)      |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/GenerateRendererPlayground.s.sol  | 0.00% (0/34)      | 0.00% (0/39)      | 100.00% (0/0)    | 0.00% (0/3)      |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| script/SeedAnvil.s.sol                   | 0.00% (0/30)      | 0.00% (0/38)      | 0.00% (0/3)      | 0.00% (0/1)      |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/BuddyNFTHatch.t.sol                 | 100.00% (2/2)     | 100.00% (1/1)     | 100.00% (0/0)    | 100.00% (1/1)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/BuddyRendererAnimation.t.sol        | 100.00% (6/6)     | 100.00% (4/4)     | 100.00% (0/0)    | 100.00% (3/3)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/CoverageGapClosers.t.sol            | 100.00% (2/2)     | 100.00% (2/2)     | 100.00% (0/0)    | 100.00% (1/1)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/helpers/HatchCoverageUuids.sol      | 100.00% (25/25)   | 100.00% (25/25)   | 100.00% (0/0)    | 100.00% (1/1)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/helpers/MockBuddyNFTForRenderer.sol | 90.00% (18/20)    | 90.00% (9/10)     | 100.00% (0/0)    | 90.00% (9/10)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/helpers/WyHashExposed.sol           | 40.00% (4/10)     | 40.00% (4/10)     | 100.00% (0/0)    | 40.00% (2/5)     |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| Total                                    | 66.08% (719/1088) | 66.00% (852/1291) | 71.66% (134/187) | 77.91% (127/163) |
╰------------------------------------------+-------------------+-------------------+------------------+------------------╯
```

⚠️ low coverage rows below 80% line coverage are scripts and one test helper:
`script/*.s.sol` and `test/helpers/WyHashExposed.sol`. No production contract row
is below 80% line coverage.

## Workstream F — closed gaps

Every listed uncovered product line now has a BUG / DEAD CODE / GAP verdict:

| File/line from baseline | Verdict | Action |
|---|---|---|
| `BuddyNFT.sol:131-132` `getTokenIdByIdentity` | GAP | Added `test_getTokenIdByIdentity_afterHatch` in `CoverageGapClosers.t.sol`. |
| `BuddyNFT.sol:252-254` owner-not-contract check | DEAD CODE | Deleted. The preceding Custodial-stage guard plus `_update` invariant make `stage == Custodial && owner != address(this)` unreachable in production. |
| `BuddyRenderer.sol:98` constructor zero-address guard | GAP | Added one negative constructor test per zero arg. |
| `BuddyRenderer.sol:969` species fallback | BUG | `BuddyRenderer.tokenURI(address buddyNft, ...)` accepts arbitrary `IBuddyNFT` data; added `test_labelFallback_speciesUnknown_reachesFallbackBeforeSpriteRevert`. Invalid species still reverts later in `BuddySpriteData`. |
| `BuddyRenderer.sol:978` rarity fallback | BUG | Added `test_labelFallback_rarityUnknown` for arbitrary external renderer input. |
| `BuddyRenderer.sol:988` eye glyph fallback | BUG | Added `test_labelFallback_eyeGlyphQuestionMark` for arbitrary external renderer input. |
| `BuddyRenderer.sol:1001` eye label fallback | BUG | Added `test_labelFallback_eyeLabelUnknown` for arbitrary external renderer input. |
| `BuddyRenderer.sol:1013` hat fallback | DEAD CODE | Deleted. `_renderSpriteRow` calls `spriteData.getHatRow(hat)` for at least one blank row-0 frame across every species in current sprite data, which reverts with `InvalidHatIndex` before metadata generation. Verified empirically: mock-injected `(species=16 Mushroom, hat=8)` still reverts via sprite data because Mushroom's frame 0 and frame 1 both have blank row 0. Verdict re-checked under reviewer pushback; held. |
| `BuddyRenderer.sol:1019` stage fallback | DEAD CODE | Deleted. External enum decoding rejects invalid `OwnershipStage` values, and canonical internal callers only produce `Custodial` or `Bonded`. |
| `BuddyRenderer.sol:1031-1059` XML escape branches | GAP | Added surgical `test_xmlEscape_*` coverage through a renderer test harness. Bond names do not flow into SVG in the current contract; the harness directly covers the internal escape utility. |
| `BuddyRenderer.sol:1084-1104` JSON escape branches | GAP | Added deterministic bonded-name tests for backslash, `\b`, `\t`, `\n`, `\f`, `\r`, and generic `\u00xx` control escaping. |

The `_hatLabel` DEAD verdict was challenged in a follow-up review on the
grounds that `BODY_USES_ROW_0` species (Mushroom, Octopus, Penguin, etc.) might
bypass `getHatRow`. Empirical testing refuted this: every species has at least
one blank row-0 frame in current sprite data, so the `getHatRow` revert is the
universal upstream gate. Verdict remains DEAD.

Updated product coverage: `BuddyNFT.sol` and `BuddyRenderer.sol` are both 100% line / statement / branch / function coverage.

## Files intentionally excluded from coverage interpretation

These are tools or test scaffolding, not product contract targets:
- `script/*.s.sol` deployment, generation, seed, and UUID search scripts.
- `test/*.t.sol` test contracts when they appear in the default summary.
- `test/helpers/*.sol`, including mocks/exposed wrappers used only by tests.
- `contract-data/**` and renderer/font fixture files are data inputs, not Solidity
  coverage targets.

## Mutation testing methodology

Each mutant is a single-line edit to a contract; we run `forge test` and assert
the suite catches it by failing. If the suite passes despite the mutant, it is a
coverage hole. Mutants are applied one at a time and reverted before the next
mutant; no mutant contract changes are committed.

## Mutation results table

| # | Location | Mutation | Caught by | Result |
|---|---|---|---|---|
| 1 | `BuddyNFT.sol:217` | `_minted[identityHash]` -> `!_minted[identityHash]` | `test_hatch_success` | caught; 68 failing tests |
| 2 | `BuddyNFT.sol:20` | `MAX_NAME_LENGTH = 14` -> `15` | `test_bond_revertsNameTooLong` | caught; 1 failing test |
| 3 | `BuddyNFT.sol:264` | recipient mismatch check commented out | `testFuzz_bond_attestationFields` | caught; 2 failing tests |
| 4 | `BuddyNFT.sol:319` | `revert Soulbound()` -> `return super._update(...)` | `test_soulbound_bonded_callerIsOwner_revertsViaUpdateOverride` | caught; 3 failing tests |
| 5 | `BuddyNFT.sol:268` | `expiry < block.timestamp` -> `expiry > block.timestamp` | `testFuzz_bond_attestationFields` | caught; 31 failing tests |
| 6 | `BuddyRenderer.sol:958` | species 7 label `Penguin` -> `Octopus` | `test_hatchCoverageFixtures` | caught; 1 failing test |
| 7 | `BuddyRenderer.sol:234` | delete `_titleText(traits, stage)` SVG row | `test_hatchCoverageFixtures` | caught; 8 failing tests |
| 8 | `BuddyRenderer.sol:629` | `_replaceEyes` returns `row` unchanged | `test_hatchCoverageFixtures` | caught; 4 failing tests |

## Action items

- No uncaught mutants. No new tests required from this mutation pass.
- Keep coverage out of per-commit gates; use it as an explicit release/audit check.

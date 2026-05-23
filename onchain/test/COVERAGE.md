# Coverage and mutation tracking

## Status / date

Baseline captured 2026-05-22; 227 tests, 20 suites.

Notes:
- `cd onchain && forge test` passes 227 tests across 20 suites.
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
Ran 20 test suites in 9.18s (69.46s CPU time): 215 tests passed, 0 failed, 2 skipped (217 total tests)

╭------------------------------------------+-------------------+-------------------+------------------+------------------╮
| File                                     | % Lines           | % Statements      | % Branches       | % Funcs          |
+========================================================================================================================+
| contracts/BuddyFont.sol                  | 100.00% (4/4)     | 100.00% (2/2)     | 100.00% (0/0)    | 100.00% (2/2)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddyFontPayload.sol           | 100.00% (14/14)   | 100.00% (13/13)   | 100.00% (2/2)    | 100.00% (4/4)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddyNFT.sol                   | 97.95% (143/146)  | 98.71% (153/155)  | 96.30% (26/27)   | 96.30% (26/27)   |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| contracts/BuddyRenderer.sol              | 89.35% (302/338)  | 92.01% (403/438)  | 89.16% (74/83)   | 98.21% (55/56)   |
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
| test/helpers/HatchCoverageUuids.sol      | 100.00% (25/25)   | 100.00% (25/25)   | 100.00% (0/0)    | 100.00% (1/1)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/helpers/MockBuddyNFTForRenderer.sol | 90.00% (18/20)    | 90.00% (9/10)     | 100.00% (0/0)    | 90.00% (9/10)    |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| test/helpers/WyHashExposed.sol           | 40.00% (4/10)     | 40.00% (4/10)     | 100.00% (0/0)    | 40.00% (2/5)     |
|------------------------------------------+-------------------+-------------------+------------------+------------------|
| Total                                    | 62.57% (682/1090) | 63.27% (820/1296) | 66.84% (127/190) | 76.54% (124/162) |
╰------------------------------------------+-------------------+-------------------+------------------+------------------╯
```

⚠️ low coverage rows below 80% line coverage are scripts and one test helper:
`script/*.s.sol` and `test/helpers/WyHashExposed.sol`. No production contract row
is below 80% line coverage.

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

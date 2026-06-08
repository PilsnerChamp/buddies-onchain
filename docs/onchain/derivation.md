# Trait derivation

Deterministic pipeline from `accountUuid` to identity hash and traits. Same input, same output, every time, on every machine.

## Pipeline

```
lowercase accountUuid
  -> keccak identityHash
  -> raw32 || "buddies-onchain:trait-seed:v2"
  -> wyhash             -> 32-bit prngSeed
  -> Mulberry32         -> floats in [0, 1)
  -> deriveTraits       -> { rarity, species, eye, hat, shiny, stats }
```

Two parity domains: TypeScript at `plugin/src/bone-deriver.ts`, Solidity at `onchain/contracts/libraries/WyHash.sol` + `onchain/contracts/libraries/Mulberry32.sol` called from `BuddyNFT.hatch`. Output must match byte-for-byte. The contract accepts only the already-computed `bytes32 identityHash`; callers validate/canonicalize UUIDs and compute the identity hash off-chain.

## Seed construction

```ts
const identityHash = computeIdentityHash(accountUuid);
const seedInput = concatBytes([
  hexToBytes(identityHash),
  stringToBytes("buddies-onchain:trait-seed:v2"),
]);
const seed32 = Number(BigInt.asUintN(64, Bun.hash(seedInput)) & 0xffffffffn);
```

Rules: `identityHash` is 32 raw bytes in the WyHash preimage, not a `"0x…"` string and not 64 hex characters. The seed domain is `buddies-onchain:trait-seed:v2`.

## Mulberry32

```ts
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function (): number {
    state |= 0;
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Output is a float in `[0, 1)`. Call order is load-bearing. State mutation must match Solidity step-for-step.

## Trait order

Fixed. Any reorder changes downstream rolls.

1. Rarity — weighted across `[60, 25, 10, 4, 1]` (common, uncommon, rare, epic, legendary).
2. Species — uniform across 18 entries.
3. Eye — uniform across 6 entries.
4. Hat — common rarity always gets `none` and consumes no PRNG call. Other rarities roll uniformly across 8 entries.
5. Shiny — `rng() < 0.01`.
6. Stats — primary index, secondary via rejection sampling, then values in fixed order: `DEBUGGING`, `PATIENCE`, `CHAOS`, `WISDOM`, `SNARK`.

The rejection loop for the secondary stat is load-bearing.

## Identity hash vs PRNG seed

```text
identityHash = keccak256("buddies-onchain:identity:v1" || 0x1f || lowercase(accountUuid))
prngSeed     = wyhash(raw32(identityHash) || "buddies-onchain:trait-seed:v2") & 0xFFFFFFFF
```

Uniqueness is enforced on `identityHash`, not `prngSeed`. Two different UUIDs that happen to collide on `prngSeed` get the same traits but distinct tokens.

## UUID validation

RFC 4122 v4 only — pattern `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`. UUID validation is off-chain in shared helpers before hashing. Shared strict throw-on-fail validator: `shared/assertCanonicalV4Uuid.ts`; regex check: `shared/isValidUuid.ts`.

Advisory only. The contract is hash-only and accepts any non-zero `bytes32`. Client v4 validation is not an on-chain guarantee; it stops clients from hashing a non-UUID, nothing more.

## Reference vectors

Pinned fixtures:

- `onchain/test/vectors/wyhash-vectors.json`
- `onchain/test/vectors/mulberry32-vectors.json`

Rendered visual references (human-eyeball showroom): `onchain/contract-data/reference-cards/`.

Sample canonical vector — UUID `47492784-eec5-4983-8072-9e2aa832c24b` → identityHash `0x11c1f0ff5f3422e0e9c64abda3c02ca65cb05b5fe768946f7f3f7b89ae3667f6` → seed32 `4116242804` → common duck, eye `◉`, no hat, not shiny, stats `DEBUGGING=84 PATIENCE=24 CHAOS=4 WISDOM=36 SNARK=23`.

## Verifying parity

```bash
# Regenerate TypeScript-side vectors
bun run plugin/scripts/generate-wyhash-vectors.ts
bun run plugin/scripts/generate-mulberry32-vectors.ts

# Solidity-side parity
cd onchain && forge test --match-contract 'WyHash|Mulberry32|BuddyNFTHatch'

# Plugin-side parity
bun --cwd plugin test mulberry32-parity
```

Drift fails the parity tests with the offending vector index.

See `docs/onchain/contract.md` for the on-chain `hatch()` flow and `docs/onchain/build.md` for the deployment manifest shape.

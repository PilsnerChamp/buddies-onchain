# Trait derivation

Deterministic pipeline from `accountUuid` to a trait seed, then to traits. Same input, same output, every time, on every machine. The seed is computed off-chain and passed into `hatch`; the contract derives traits from the stored seed.

## Pipeline

```
lowercase accountUuid
  -> wyhash(uuid || "friend-2026-401")  -> 32-bit prngSeed   (client-side)
  -> hatch(identityHash, prngSeed)       -> seed stored on-chain
  -> Mulberry32                          -> floats in [0, 1)
  -> deriveTraits                        -> { rarity, species, eye, hat, shiny, stats }
```

`identityHash` is a separate, parallel derivation off the same UUID — the privacy, lookup, and uniqueness key. It plays no part in trait derivation. See [Identity hash vs PRNG seed](#identity-hash-vs-prng-seed).

The seed is computed once, client-side, and stored verbatim. The contract holds no seed-derivation logic — no WyHash, no domain tag, no UUID. `Mulberry32.deriveTraits` is the only on-chain derivation step, and it reads the stored `prngSeed`. Off-chain TS and on-chain Solidity must match byte-for-byte:

| Step | TS source | Solidity source |
|---|---|---|
| seed (`wyhash`) | `plugin/src/bone-deriver.ts` | client-only — not on chain |
| `Mulberry32` | `plugin/src/bone-deriver.ts` | `onchain/contracts/libraries/Mulberry32.sol` |

## Consistency, not authenticity

The chain proves `traits == Mulberry32.deriveTraits(storedSeed)`. Anyone can recompute it — that is consistency. It does not prove the seed came from your identity — that would be authenticity, and the hash-only contract cannot enforce it.

Safe claims: deterministic and reproducible (same account → same buddy on every deployment), deployment-stable preservation, UUID kept off the wire. Authenticity is re-established only at Stage 2 (`bond()`, dormant in v1). Do not claim the buddy is self-verifying or that the contract derives traits from your identity.

## Seed construction

```ts
const seed32 = Number(
  BigInt.asUintN(64, wyhash(stringToBytes(lowercase(accountUuid) + "friend-2026-401"))) & 0xffffffffn,
);
```

Rules: the WyHash preimage is the lowercased UUID string concatenated with the salt `friend-2026-401`, hashed as UTF-8 bytes. `identityHash` is not part of the seed preimage. The plugin computes this and passes `seed32` into `hatch`; the dApp never recomputes it (see [`docs/site/architecture.md`](../site/architecture.md#hatch-fragment)).

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

Two independent derivations off the same UUID. Neither feeds the other.

```text
identityHash = keccak256("buddies-onchain:identity:claude:v1" || 0x1f || lowercase(accountUuid))
prngSeed     = wyhash(lowercase(accountUuid) || "friend-2026-401") & 0xFFFFFFFF
```

`identityHash` is the privacy, lookup, and uniqueness key — never an input to traits. `prngSeed` is the sole trait input. Uniqueness is enforced on `identityHash`, not `prngSeed`. Two different UUIDs that happen to collide on `prngSeed` get the same traits but distinct tokens.

## UUID validation

RFC 4122 v4 only — pattern `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`. UUID validation is off-chain in shared helpers before hashing. Shared strict throw-on-fail validator: `shared/assertCanonicalV4Uuid.ts`; regex check: `shared/isValidUuid.ts`.

Advisory only. The contract is hash-only and accepts any non-zero `bytes32`. Client v4 validation is not an on-chain guarantee; it stops clients from hashing a non-UUID, nothing more.

## Reference vectors

Pinned fixtures:

- `onchain/test/vectors/wyhash-vectors.json`
- `onchain/test/vectors/mulberry32-vectors.json`

Rendered visual references (human-eyeball showroom): `onchain/contract-data/reference-cards/`.

Sample canonical vector — UUID `47492784-eec5-4983-8072-9e2aa832c24b` → identityHash `0x0fa54136bda4ecc31bcd4169c89d1ea7d5f294d7ef27022c1f68cfd5bab4ddbb` → seed32 `2990586173` → epic robot, eye `×`, no hat, not shiny, stats `DEBUGGING=57 PATIENCE=49 CHAOS=33 WISDOM=68 SNARK=100`.

## Verifying parity

WyHash now guards the client-side seed only — `hatch` no longer calls it. `WyHash.t.sol` tests the primitive against `wyhash-vectors.json` (preimage `lowercase(uuid) + "friend-2026-401"`). Mulberry32 parity guards the on-chain trait step.

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

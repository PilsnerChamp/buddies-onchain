/**
 * Generate cross-domain PRNG parity test vectors.
 *
 * Usage: bun run plugin/scripts/generate-mulberry32-vectors.ts
 * Output: onchain/test/vectors/mulberry32-vectors.json
 *
 * This script produces deterministic output — running it again must produce
 * byte-for-byte identical JSON. No random seeds, no Date.now(), no env vars.
 */

import {
  SPECIES,
  EYES,
  HATS,
  STAT_NAMES,
  RARITY_ORDER,
  RARITY_WEIGHTS,
  STAT_BASE,
  deriveBones,
  pick,
  rollRarity,
  type BuddyBones,
  type Rarity,
  type StatName,
} from "../src/bone-deriver";

// ---------- Raw PRNG (returns uint32, not float) --------------------------

function makeMulberry32Raw(seed: number): () => number {
  let state = seed >>> 0;
  return function (): number {
    state |= 0;
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// ---------- Float PRNG (for deriveBones) ----------------------------------

function makeMulberry32Float(seed: number): () => number {
  let state = seed >>> 0;
  return function (): number {
    state |= 0;
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Fixed seed list -----------------------------------------------

const SEEDS: number[] = [
  // Category 1: Known test vectors
  2990586173, 3565035807, 1000000007, 42, 777777777,
  // Category 2: Boundary and edge cases
  0, 1, 2, 4294967295, 2147483647, 2147483648, 1831565813, 3663131626, 100,
  12345,
  // Category 3: Coverage seeds
  50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000,
  50000000, 100000000, 250000000, 500000000, 750000000, 1000000000, 1250000000,
  1500000000, 1750000000, 2000000000, 2250000000, 2500000000, 2750000000,
  3000000000, 3250000000, 3500000000, 3750000000, 4000000000, 4100000000,
  4200000000, 4250000000, 4280000000, 4290000000, 4294000000, 4294900000,
  4294960000,
];

// ---------- Trait mapping -------------------------------------------------

function rarityToUint8(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

function speciesToUint8(s: string): number {
  return SPECIES.indexOf(s as any);
}

function eyeToUint8(e: string): number {
  return EYES.indexOf(e as any);
}

function hatToUint8(h: string): number {
  return HATS.indexOf(h as any);
}

// ---------- Vector generation ---------------------------------------------

interface TraitVector {
  seed: number;
  rawOutputs: number[];
  secondaryRejectionCount: number;
  traits: {
    rarity: number;
    species: number;
    eyes: number;
    hat: number;
    shiny: boolean;
    debugging: number;
    patience: number;
    chaos: number;
    wisdom: number;
    snark: number;
  };
}

/**
 * Derivation replay that mirrors `deriveBones` exactly but also counts how
 * many times the secondary-stat rejection loop rerolled (i.e. how many extra
 * PRNG calls were consumed past the initial secondary roll). A count of 0 means
 * the initial secondary roll already differed from the primary; 1 means the
 * loop rerolled once, and so on.
 *
 * This MUST stay in lockstep with `deriveBones` in plugin/src/bone-deriver.ts
 * and with `_deriveStats` in onchain/contracts/libraries/Mulberry32.sol. Changing the
 * call order here without also updating those is a cross-domain parity break.
 */
function deriveBonesWithRejectionCount(
  rng: () => number
): { bones: BuddyBones; secondaryRejectionCount: number } {
  // 1. Rarity (weighted roll)
  const rarity = rollRarity(rng);

  // 2. Species
  const species = pick(rng, SPECIES);

  // 3. Eye style
  const eye = pick(rng, EYES);

  // 4. Hat (common always gets "none")
  const hat = rarity === "common" ? "none" : pick(rng, HATS);

  // 5. Shiny (1% chance)
  const shiny = rng() < 0.01;

  // 6. Stats
  const base = STAT_BASE[rarity];
  const primary = pick(rng, STAT_NAMES);
  let secondary = pick(rng, STAT_NAMES);
  let secondaryRejectionCount = 0;
  while (secondary === primary) {
    secondaryRejectionCount++;
    secondary = pick(rng, STAT_NAMES);
  }

  const stats = {} as Record<StatName, number>;
  for (const s of STAT_NAMES) {
    if (s === primary) {
      stats[s] = Math.min(100, base + 50 + Math.floor(rng() * 30));
    } else if (s === secondary) {
      stats[s] = Math.max(1, base - 10 + Math.floor(rng() * 15));
    } else {
      stats[s] = base + Math.floor(rng() * 40);
    }
  }

  return {
    bones: {
      rarity,
      species: species as BuddyBones["species"],
      eye: eye as BuddyBones["eye"],
      hat: hat as BuddyBones["hat"],
      shiny,
      stats,
    },
    secondaryRejectionCount,
  };
}

function generateVector(seed: number): TraitVector {
  // Capture first 20 raw uint32 outputs
  const rawRng = makeMulberry32Raw(seed);
  const rawOutputs: number[] = [];
  for (let i = 0; i < 20; i++) {
    rawOutputs.push(rawRng());
  }

  // Derive traits via the replay helper (tracks rejection loop count).
  // Cross-check against the canonical deriveBones on a fresh RNG to catch
  // any drift between the two derivations.
  const replayRng = makeMulberry32Float(seed);
  const { bones, secondaryRejectionCount } =
    deriveBonesWithRejectionCount(replayRng);

  const canonicalRng = makeMulberry32Float(seed);
  const canonical = deriveBones(canonicalRng);
  if (
    canonical.rarity !== bones.rarity ||
    canonical.species !== bones.species ||
    canonical.eye !== bones.eye ||
    canonical.hat !== bones.hat ||
    canonical.shiny !== bones.shiny ||
    canonical.stats.DEBUGGING !== bones.stats.DEBUGGING ||
    canonical.stats.PATIENCE !== bones.stats.PATIENCE ||
    canonical.stats.CHAOS !== bones.stats.CHAOS ||
    canonical.stats.WISDOM !== bones.stats.WISDOM ||
    canonical.stats.SNARK !== bones.stats.SNARK
  ) {
    throw new Error(
      `deriveBonesWithRejectionCount drifted from deriveBones for seed ${seed}`
    );
  }

  return {
    seed,
    rawOutputs,
    secondaryRejectionCount,
    traits: {
      rarity: rarityToUint8(bones.rarity),
      species: speciesToUint8(bones.species),
      eyes: eyeToUint8(bones.eye),
      hat: hatToUint8(bones.hat),
      shiny: bones.shiny,
      debugging: bones.stats.DEBUGGING,
      patience: bones.stats.PATIENCE,
      chaos: bones.stats.CHAOS,
      wisdom: bones.stats.WISDOM,
      snark: bones.stats.SNARK,
    },
  };
}

// ---------- Main ----------------------------------------------------------

const vectors = SEEDS.map(generateVector);

// Verify corpus coverage
let commonCount = 0;
let nonCommonCount = 0;
const rejectionHistogram: Record<number, number> = {};
let maxRejection = 0;
for (const v of vectors) {
  if (v.traits.rarity === 0) commonCount++;
  else nonCommonCount++;
  const c = v.secondaryRejectionCount;
  rejectionHistogram[c] = (rejectionHistogram[c] ?? 0) + 1;
  if (c > maxRejection) maxRejection = c;
}

if (commonCount < 2) {
  console.error(
    `WARNING: Only ${commonCount} Common vectors. Need at least 2.`
  );
}
if (nonCommonCount < 2) {
  console.error(
    `WARNING: Only ${nonCommonCount} non-Common vectors. Need at least 2.`
  );
}

// Plan requires at least one vector where the secondary rejection loop
// rerolled one or more times, and ideally at least one with 2+ rerolls.
const ge1 = vectors.filter((v) => v.secondaryRejectionCount >= 1).length;
const ge2 = vectors.filter((v) => v.secondaryRejectionCount >= 2).length;
if (ge1 < 1) {
  console.error(
    "WARNING: No vectors with secondaryRejectionCount >= 1 -- coverage gap."
  );
}
if (ge2 < 1) {
  console.error(
    "WARNING: No vectors with secondaryRejectionCount >= 2 -- coverage gap."
  );
}

const output = {
  description:
    "Cross-domain PRNG parity vectors -- must pass in both TypeScript and Solidity",
  generatedBy: "plugin/scripts/generate-mulberry32-vectors.ts",
  seedCount: vectors.length,
  vectors,
};

const json = JSON.stringify(output, null, 2) + "\n";

const outPath = new URL("../../onchain/test/vectors/mulberry32-vectors.json", import.meta.url);
await Bun.write(outPath, json);

console.log(`Generated ${vectors.length} vectors to onchain/test/vectors/mulberry32-vectors.json`);
console.log(`  Common: ${commonCount}, Non-Common: ${nonCommonCount}`);
console.log(
  `  secondaryRejectionCount histogram: ${JSON.stringify(rejectionHistogram)}`
);
console.log(`  rejection >=1: ${ge1}, >=2: ${ge2}, max: ${maxRejection}`);

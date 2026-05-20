/**
 * Cross-domain PRNG parity test.
 *
 * Reads the shared JSON vectors at `onchain/test/vectors/mulberry32-vectors.json` --
 * the same file the Foundry test suite consumes -- and asserts that the
 * TypeScript implementation produces byte-for-byte identical output for
 * both the raw PRNG step function and the derived traits.
 *
 * This is the plan-compliance guarantee: both domains (Solidity and
 * TypeScript) validate against ONE source of truth. If either side drifts,
 * exactly one of the two test suites will fail loudly.
 *
 * NOTE: The JSON stores traits using Solidity's numeric uint8 encoding
 * (rarity/species/eyes/hat as indexes). We translate the TS string traits
 * back into those indexes for comparison.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeMulberry32,
  deriveBones,
  SPECIES,
  EYES,
  HATS,
  RARITY_ORDER,
  type Rarity,
} from "../src/bone-deriver";

// ---------- Raw PRNG (uint32 output, no float divide) --------------------

/**
 * Mulberry32 that returns the raw uint32 output instead of a float in [0, 1).
 * Exact replica of `makeMulberry32` minus the final `/ 4294967296`. Used to
 * cross-check against the `rawOutputs` array in the JSON vectors.
 */
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

// ---------- JSON vector shape --------------------------------------------

interface VectorTraits {
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
}

interface Vector {
  seed: number;
  rawOutputs: number[];
  secondaryRejectionCount: number;
  traits: VectorTraits;
}

interface VectorFile {
  description: string;
  generatedBy: string;
  seedCount: number;
  vectors: Vector[];
}

// Resolve path relative to the repo root. Bun's CWD is the repo root when
// tests run via `bun test` from the `plugin/` directory, so climb one level.
const VECTOR_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "onchain",
  "test",
  "vectors",
  "mulberry32-vectors.json"
);

const raw = readFileSync(VECTOR_PATH, "utf8");
const vectorFile = JSON.parse(raw) as VectorFile;

// ---------- Trait mapping helpers ----------------------------------------

function rarityToUint8(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

// ==========================================================================
// Tests
// ==========================================================================

describe("mulberry32 parity vectors (shared with Foundry)", () => {
  test("loaded the expected vector file", () => {
    expect(vectorFile.seedCount).toBe(vectorFile.vectors.length);
    expect(vectorFile.seedCount).toBeGreaterThanOrEqual(50);
    expect(vectorFile.description).toContain("parity");
  });

  test("every vector declares secondaryRejectionCount", () => {
    for (const v of vectorFile.vectors) {
      expect(typeof v.secondaryRejectionCount).toBe("number");
      expect(v.secondaryRejectionCount).toBeGreaterThanOrEqual(0);
    }
  });

  test("corpus covers secondary rejection loop reruns (>=1 and >=2)", () => {
    const ge1 = vectorFile.vectors.filter(
      (v) => v.secondaryRejectionCount >= 1
    ).length;
    const ge2 = vectorFile.vectors.filter(
      (v) => v.secondaryRejectionCount >= 2
    ).length;
    expect(ge1).toBeGreaterThanOrEqual(1);
    expect(ge2).toBeGreaterThanOrEqual(1);
  });
});

describe("mulberry32 raw PRNG sequence matches JSON vectors", () => {
  for (const v of vectorFile.vectors) {
    test(`seed ${v.seed}: raw uint32 outputs match`, () => {
      const rng = makeMulberry32Raw(v.seed);
      for (let i = 0; i < v.rawOutputs.length; i++) {
        const actual = rng();
        expect(actual).toBe(v.rawOutputs[i]);
      }
    });
  }
});

describe("deriveBones traits match JSON vectors", () => {
  for (const v of vectorFile.vectors) {
    test(`seed ${v.seed}: derived traits match`, () => {
      const rng = makeMulberry32(v.seed);
      const bones = deriveBones(rng);

      // Translate string traits back to the Solidity uint8 encoding
      expect(rarityToUint8(bones.rarity)).toBe(v.traits.rarity);
      expect(SPECIES.indexOf(bones.species)).toBe(v.traits.species);
      expect(EYES.indexOf(bones.eye)).toBe(v.traits.eyes);
      expect(HATS.indexOf(bones.hat)).toBe(v.traits.hat);
      expect(bones.shiny).toBe(v.traits.shiny);

      expect(bones.stats.DEBUGGING).toBe(v.traits.debugging);
      expect(bones.stats.PATIENCE).toBe(v.traits.patience);
      expect(bones.stats.CHAOS).toBe(v.traits.chaos);
      expect(bones.stats.WISDOM).toBe(v.traits.wisdom);
      expect(bones.stats.SNARK).toBe(v.traits.snark);
    });
  }
});

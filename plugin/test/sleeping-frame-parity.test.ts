/**
 * Cross-domain parity test: local sleepingFrame vs the contract's blink frame.
 *
 * Reads `onchain/test/vectors/sleeping-frame-vectors.json` -- the same file
 * the Foundry suite consumes -- and asserts the TypeScript implementation
 * produces row-for-row identical output for each fixture UUID.
 *
 * If either side drifts (sprite source, hash algorithm, hat-injection rule,
 * eye replacement, right-trim) exactly one of the two suites fails loudly.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sleepingFrame } from "../src/sleeping-frame";
import { deriveBuddyFromAccount, EYES, HATS, SPECIES } from "../src/bone-deriver";

interface Vector {
  accountUuid: string;
  speciesIndex: number;
  hatIndex: number;
  eyesIndex: number;
  expectedFb: string[];
}

interface VectorFile {
  description: string;
  generatedBy: string;
  vectorCount: number;
  vectors: Vector[];
}

const VECTOR_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "onchain",
  "test",
  "vectors",
  "sleeping-frame-vectors.json"
);

const vectorFile = JSON.parse(readFileSync(VECTOR_PATH, "utf8")) as VectorFile;

describe("sleeping-frame parity vectors (shared with Foundry)", () => {
  test("vector file is well-formed and non-empty", () => {
    expect(vectorFile.vectorCount).toBe(vectorFile.vectors.length);
    expect(vectorFile.vectorCount).toBeGreaterThanOrEqual(3);
    expect(vectorFile.description).toContain("parity");
  });

  // Row-0-using species (eyes on row 0) cannot appear in fb fixtures because
  // every current species has a blank row 0 in frame 0. The codegen-time
  // invariant in `gen-sleeping-atlas.mjs` (row 0 is all-blank or contains `0`)
  // is the only safety net for that case until/unless the sprite corpus adds
  // a row-0-using species — at which point a fixture must be added here.
  test("fixture coverage includes hatless and hatted cases", () => {
    const hatless = vectorFile.vectors.filter((v) => v.hatIndex === 0).length;
    const hatted = vectorFile.vectors.filter((v) => v.hatIndex !== 0).length;
    expect(hatless).toBeGreaterThanOrEqual(1);
    expect(hatted).toBeGreaterThanOrEqual(1);
  });

  for (const v of vectorFile.vectors) {
    test(`uuid ${v.accountUuid}: bones indexes match wyhash derivation`, () => {
      const { bones } = deriveBuddyFromAccount(v.accountUuid);
      expect(SPECIES.indexOf(bones.species)).toBe(v.speciesIndex);
      expect(HATS.indexOf(bones.hat)).toBe(v.hatIndex);
      expect(EYES.indexOf(bones.eye)).toBe(v.eyesIndex);
    });

    test(`uuid ${v.accountUuid}: sleepingFrame rows match expectedFb`, () => {
      const out = sleepingFrame({ accountUuid: v.accountUuid });
      expect(out.frameId).toBe("fb");
      expect(out.rows).toEqual(v.expectedFb);
    });
  }
});

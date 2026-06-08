/**
 * Generate cross-domain parity vectors for the sleeping-buddy frame.
 *
 * Usage: bun run plugin/scripts/generate-sleeping-vectors.ts
 * Output: onchain/test/vectors/sleeping-frame-vectors.json
 *
 * Each vector pins:
 *   - accountUuid input
 *   - bones derived via identityHash raw32 + SEED_DOMAIN + wyhash + Mulberry32
 *     (species, hat, eye index)
 *   - expectedFb rows after the contract's blink rules: row-0 hat injection,
 *     `0` -> `-`, right-trim
 *
 * Both sides validate against this JSON:
 *   - TS test runs sleepingFrame(accountUuid) and asserts row-equality.
 *   - Solidity test hatches the UUID, reads tokenURI, extracts <g id="fb">
 *     sprite rows, and asserts row-equality.
 *
 * No `--check` mode: vectors are TS-derived, so a check would be circular.
 * The Solidity test (which decodes the actual on-chain SVG) is the
 * authoritative oracle — drift between source and atlas surfaces there.
 *
 * Deterministic: re-running with the same source produces byte-stable JSON.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { deriveBuddyFromAccount, EYES, HATS, SPECIES } from "../src/bone-deriver";
import { sleepingFrame } from "../src/sleeping-frame";

const FIXTURE_UUIDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
];

interface Vector {
  accountUuid: string;
  speciesIndex: number;
  hatIndex: number;
  eyesIndex: number;
  expectedFb: string[];
}

function buildVector(accountUuid: string): Vector {
  const { bones } = deriveBuddyFromAccount(accountUuid);
  const frame = sleepingFrame({ accountUuid });
  return {
    accountUuid,
    speciesIndex: SPECIES.indexOf(bones.species),
    hatIndex: HATS.indexOf(bones.hat),
    eyesIndex: EYES.indexOf(bones.eye),
    expectedFb: frame.rows,
  };
}

const vectors = FIXTURE_UUIDS.map(buildVector);

const out = {
  description: "Cross-domain sleeping-frame parity vectors. Both TypeScript (sleepingFrame) and Solidity (BuddyRenderer fb) must produce these expectedFb rows for each accountUuid.",
  generatedBy: "plugin/scripts/generate-sleeping-vectors.ts",
  vectorCount: vectors.length,
  vectors,
};

const repoRoot = join(import.meta.dir, "..", "..");
const outPath = join(repoRoot, "onchain", "test", "vectors", "sleeping-frame-vectors.json");
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath} (${vectors.length} vectors)`);

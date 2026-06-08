/**
 * Generate deterministic Bun.hash parity vectors for the WyHash Solidity port.
 *
 * Usage: bun run plugin/scripts/generate-wyhash-vectors.ts
 * Output: onchain/test/vectors/wyhash-vectors.json
 *
 * This script MUST remain deterministic:
 * - no randomness
 * - no timestamps
 * - no crypto.randomUUID()
 */

import { concatBytes, hexToBytes, stringToBytes } from "viem";

import { computeIdentityHash } from "../../shared/computeIdentityHash";

const SEED_DOMAIN = "buddies-onchain:trait-seed:v2";

type VectorCategory = "sequential-v4" | "edge-case-v4" | "collision-probe";

interface WyHashVector {
  uuid: string;
  identityHash: `0x${string}`;
  dataHex: `0x${string}`;
  saltAscii: typeof SEED_DOMAIN;
  seedInputHex: `0x${string}`;
  hash64: string;
  seed32: number;
  category: VectorCategory;
}

interface WyHashFixture {
  description: string;
  generatedBy: string;
  algorithm: "bun-wyhash";
  seedDomain: typeof SEED_DOMAIN;
  vectorCount: number;
  vectors: WyHashVector[];
}

function makeUuid(index: number): string {
  const hex = index.toString(16).padStart(32, "0");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    "8" + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
}

function formatHash64(value: bigint): string {
  return `0x${value.toString(16).padStart(16, "0")}`;
}

function createVector(uuid: string, category: VectorCategory): WyHashVector {
  const identityHash = computeIdentityHash(uuid);
  const identityHashRaw32 = hexToBytes(identityHash);
  const saltBytes = stringToBytes(SEED_DOMAIN);
  const seedInput = concatBytes([identityHashRaw32, saltBytes]);
  const bunHash64 = BigInt.asUintN(64, Bun.hash(seedInput));
  const seed32 = Number(bunHash64 & 0xffffffffn);

  if (identityHashRaw32.length !== 32) {
    throw new Error(`identityHash must be 32 bytes for ${uuid}`);
  }

  return {
    uuid,
    identityHash,
    dataHex: bytesToHex(identityHashRaw32),
    saltAscii: SEED_DOMAIN,
    seedInputHex: bytesToHex(seedInput),
    hash64: formatHash64(bunHash64),
    seed32,
    category,
  };
}

function ensureUniqueInputs(vectors: WyHashVector[]): void {
  const seen = new Set<string>();
  for (const vector of vectors) {
    if (seen.has(vector.identityHash)) {
      throw new Error(`Duplicate identityHash detected for ${vector.uuid}`);
    }
    seen.add(vector.identityHash);
  }
}

function buildVectors(): WyHashVector[] {
  const sequential = Array.from({ length: 100 }, (_, i) =>
    createVector(makeUuid(i + 1), "sequential-v4")
  );

  const edgeCaseUuids = [
    // §2 primary UUID + WyHash.t.sol gas benchmark — including it here keeps
    // GAS_EXPECTED_SEED Bun-backed by the parity gate instead of hand-entered.
    "550e8400-e29b-41d4-a716-446655440000",
    "00000000-0000-4000-8000-000000000000",
    "ffffffff-ffff-4fff-bfff-ffffffffffff",
    "01234567-89ab-4cde-8f01-23456789abcd",
    "fedcba98-7654-4321-8fed-cba987654321",
    "aaaaaaab-0000-4000-8000-000000000000",
    "00000000-bbbb-4ccc-8ddd-000000000000",
    "00000000-0000-4eee-8fff-111111111111",
    "11111111-2222-4333-8444-555555555555",
    "89abcdef-0123-4567-89ab-cdef01234567",
    "13579bdf-2468-4ace-8eca-fdb975310246",
  ] as const;
  const edgeCases = edgeCaseUuids.map((uuid) =>
    createVector(uuid, "edge-case-v4")
  );

  const collisionProbeUuids = [
    "12345678-1234-4abc-8def-1234567890ab",
    "22345678-1234-4abc-8def-1234567890ab",
    "12345679-1234-4abc-8def-1234567890ab",
    "12345678-1235-4abc-8def-1234567890ab",
    "12345678-1234-4abc-8def-1234567890ac",
  ] as const;
  const collisionProbes = collisionProbeUuids.map((uuid) =>
    createVector(uuid, "collision-probe")
  );

  const vectors = [...sequential, ...edgeCases, ...collisionProbes];
  ensureUniqueInputs(vectors);
  return vectors;
}

function buildFixture(vectors: WyHashVector[]): WyHashFixture {
  return {
    description:
      "WyHash Bun parity vectors over raw identityHash bytes plus the hatch trait seed domain",
    generatedBy: "plugin/scripts/generate-wyhash-vectors.ts",
    algorithm: "bun-wyhash",
    seedDomain: SEED_DOMAIN,
    vectorCount: vectors.length,
    vectors,
  };
}

const fixture = buildFixture(buildVectors());
const outputPath = new URL(
  "../../onchain/test/vectors/wyhash-vectors.json",
  import.meta.url
);

await Bun.write(outputPath, JSON.stringify(fixture, null, 2) + "\n");

console.log(
  `Generated ${fixture.vectorCount} WyHash vectors to onchain/test/vectors/wyhash-vectors.json`
);

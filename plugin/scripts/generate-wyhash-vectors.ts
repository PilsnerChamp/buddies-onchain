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

const DEFAULT_SALT = "friend-2026-401";
const NON_UUID_LENGTHS = [0, 1, 2, 3, 4, 7, 8, 15, 16, 17, 47, 48, 49] as const;
const ASCII_ALPHABET =
  "abcdefghijklmnopqrstuvwxyz0123456789-_=+ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type VectorCategory =
  | "real-uuid"
  | "edge-case-uuid"
  | "non-uuid"
  | "salt-variation"
  | "collision-probe";

interface WyHashVector {
  input: string;
  inputHex: string;
  inputLength: number;
  hash64: string;
  seed32: number;
  salt: string;
  category: VectorCategory;
}

interface WyHashFixture {
  description: string;
  generatedBy: string;
  algorithm: "bun-wyhash";
  salt: string;
  vectorCount: number;
  vectors: WyHashVector[];
}

const encoder = new TextEncoder();

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

function makeAsciiInput(length: number, offset: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ASCII_ALPHABET[(offset + i) % ASCII_ALPHABET.length];
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function formatHash64(value: bigint): string {
  return `0x${value.toString(16).padStart(16, "0")}`;
}

function createVector(source: string, salt: string, category: VectorCategory): WyHashVector {
  const input = source + salt;
  const bunHash64 = BigInt.asUintN(64, BigInt(Bun.hash(input)));
  const seed32 = Number(bunHash64 & 0xffffffffn);

  const inputBytes = encoder.encode(input);

  return {
    input,
    inputHex: `0x${bytesToHex(inputBytes)}`,
    inputLength: inputBytes.length,
    hash64: formatHash64(bunHash64),
    seed32,
    salt,
    category,
  };
}

function ensureUniqueInputs(vectors: WyHashVector[]): void {
  const seen = new Set<string>();
  for (const vector of vectors) {
    const key = `${vector.category}:${vector.input}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate vector detected for ${key}`);
    }
    seen.add(key);
  }
}

function buildVectors(): WyHashVector[] {
  const realUuidVectors = Array.from({ length: 80 }, (_, i) =>
    createVector(makeUuid(i + 1), DEFAULT_SALT, "real-uuid")
  );

  const edgeCaseUuids = [
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

  const edgeCaseVectors = edgeCaseUuids.map((uuid) =>
    createVector(uuid, DEFAULT_SALT, "edge-case-uuid")
  );

  const nonUuidVectors = NON_UUID_LENGTHS.map((length, index) =>
    createVector(makeAsciiInput(length, index * 7), "", "non-uuid")
  );

  const saltVariationUuid = "550e8400-e29b-41d4-a716-446655440000";
  const saltVariations = [
    "",
    DEFAULT_SALT,
    "friend-2026-402",
    "friend-2026-401!",
    "FRIEND-2026-401",
    "friend-2026-401-extra",
  ] as const;
  const saltVariationVectors = saltVariations.map((salt) =>
    createVector(saltVariationUuid, salt, "salt-variation")
  );

  const collisionProbeUuids = [
    "12345678-1234-4abc-8def-1234567890ab",
    "22345678-1234-4abc-8def-1234567890ab",
    "12345679-1234-4abc-8def-1234567890ab",
    "12345678-1235-4abc-8def-1234567890ab",
    "12345678-1234-4abc-8def-1234567890ac",
  ] as const;
  const collisionProbeVectors = collisionProbeUuids.map((uuid) =>
    createVector(uuid, DEFAULT_SALT, "collision-probe")
  );

  const vectors = [
    ...realUuidVectors,
    ...edgeCaseVectors,
    ...nonUuidVectors,
    ...saltVariationVectors,
    ...collisionProbeVectors,
  ];

  ensureUniqueInputs(vectors);
  return vectors;
}

function buildFixture(vectors: WyHashVector[]): WyHashFixture {
  return {
    description: "WyHash Bun parity vectors — Solidity port must match byte-exact",
    generatedBy: "plugin/scripts/generate-wyhash-vectors.ts",
    algorithm: "bun-wyhash",
    salt: DEFAULT_SALT,
    vectorCount: vectors.length,
    vectors,
  };
}

const fixture = buildFixture(buildVectors());
const outputPath = new URL("../../onchain/test/vectors/wyhash-vectors.json", import.meta.url);

await Bun.write(outputPath, JSON.stringify(fixture, null, 2) + "\n");

console.log(
  `Generated ${fixture.vectorCount} WyHash vectors to onchain/test/vectors/wyhash-vectors.json`
);

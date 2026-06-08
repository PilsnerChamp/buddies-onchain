import { describe, expect, test } from "bun:test";

import { assertCanonicalV4Uuid } from "~shared/assertCanonicalV4Uuid";
import { computeIdentityHash } from "~shared/computeIdentityHash";
import vectorFileJson from "../../onchain/test/vectors/identity-hash-vectors.json";

interface IdentityHashVector {
  uuid: string;
  preimageHex: `0x${string}`;
  digest: `0x${string}`;
}

interface IdentityHashFixture {
  description: string;
  generatedBy: string;
  vectorCount: number;
  vectors: IdentityHashVector[];
}

const vectorFile = vectorFileJson as IdentityHashFixture;
const PRIMARY_UUID = "550e8400-e29b-41d4-a716-446655440000";
const PRIMARY_UUID_UPPER = PRIMARY_UUID.toUpperCase();
const NON_ASCII_UUID = "550e8400-e29b-41d4-a716-44665544000é";

const SOLIDITY_VALID_V4_CASES = [
  "123e4567-e89b-42d3-8456-426614174000",
  "123e4567-e89b-42d3-9456-426614174000",
  "123e4567-e89b-42d3-a456-426614174000",
  "123e4567-e89b-42d3-b456-426614174000",
] as const;

const SOLIDITY_INVALID_V4_CASES = [
  "123e4567-e89b-42d3-a456-42661417400",
  "123e4567-e89b-42d3-a456-4266141740001",
  "123E4567-e89b-42d3-a456-426614174000",
  "123e4567-e89b-42d3-A456-426614174000",
  "g23e4567-e89b-42d3-a456-426614174000",
  "123e4567-e89b-42d3-a456-z26614174000",
  "123e4567-e89b-42d3-a456- 26614174000",
  "123e456-7e89b-42d3-a456-426614174000",
  "123e4567-e89b4-2d3-a456-426614174000",
  "123e4567e89b42d3a456426614174000abcd",
  "",
  "c232ab00-9414-11ec-b909-0242ac120002",
  "000003e8-7a83-21ed-9d00-3fdb0085247e",
  "5df41881-3aed-3515-88a7-2f4a814cf09e",
  "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  "1ec9414c-232a-6b00-b3c8-9e6bdeced846",
  "017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
  "320c3d4d-cc00-875b-8ec9-32363b3da32d",
  "123e4567-e89b-02d3-a456-426614174000",
  "123e4567-e89b-92d3-a456-426614174000",
  "123e4567-e89b-42d3-7456-426614174000",
  "123e4567-e89b-42d3-c456-426614174000",
  "123e4567-e89b-42d3-:456-426614174000",
  "123e4567-e89b-42d3-;456-426614174000",
] as const;

function rowFor(uuid: string): IdentityHashVector {
  const row = vectorFile.vectors.find((vector) => vector.uuid === uuid);
  if (!row) {
    throw new Error(`missing identity-hash vector for ${uuid}`);
  }
  return row;
}

describe("identity-hash vectors", () => {
  test("loaded the expected vector fixture", () => {
    expect(vectorFile.description).toContain("identity-hash");
    expect(vectorFile.generatedBy).toBe(
      "plugin/scripts/generate-identity-hash-vectors.ts"
    );
    expect(vectorFile.vectorCount).toBe(vectorFile.vectors.length);
    expect(vectorFile.vectorCount).toBeGreaterThanOrEqual(4);
  });

  for (const vector of vectorFile.vectors) {
    test(`uuid ${vector.uuid}: computeIdentityHash matches vector digest`, () => {
      expect(vector.preimageHex).toStartWith("0x");
      expect(computeIdentityHash(vector.uuid)).toBe(vector.digest);
    });
  }

  test("uppercase input canonicalizes to the lowercase twin digest", () => {
    const lower = rowFor(PRIMARY_UUID);
    const upper = rowFor(PRIMARY_UUID_UPPER);

    expect(upper.digest).toBe(lower.digest);
    expect(computeIdentityHash(PRIMARY_UUID_UPPER)).toBe(lower.digest);
  });

  test("canonical UUID primitive rejects uppercase before caller canonicalization", () => {
    expect(() => assertCanonicalV4Uuid(PRIMARY_UUID_UPPER)).toThrow();
  });

  test("shared validator accepts the old Solidity v4 variant matrix", () => {
    for (const uuid of SOLIDITY_VALID_V4_CASES) {
      expect(() => assertCanonicalV4Uuid(uuid)).not.toThrow();
    }
  });

  test("shared validator rejects the old Solidity invalid UUID cases", () => {
    for (const uuid of SOLIDITY_INVALID_V4_CASES) {
      expect(() => assertCanonicalV4Uuid(uuid)).toThrow();
    }
  });

  test("rejects whitespace-padded UUIDs without trimming", () => {
    expect(() => computeIdentityHash(` ${PRIMARY_UUID} `)).toThrow();
  });

  test("rejects non-ASCII UUID-shaped strings", () => {
    expect(() => computeIdentityHash(NON_ASCII_UUID)).toThrow();
  });

  test("rejects v1 and nil UUIDs", () => {
    expect(() =>
      computeIdentityHash("c232ab00-9414-11ec-b909-0242ac120002")
    ).toThrow();
    expect(() =>
      computeIdentityHash("00000000-0000-0000-0000-000000000000")
    ).toThrow();
  });
});

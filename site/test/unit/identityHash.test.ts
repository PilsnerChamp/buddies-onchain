import { describe, expect, it } from 'vitest';

import { assertCanonicalV4Uuid } from '~shared/assertCanonicalV4Uuid';
import { computeIdentityHash } from '~shared/computeIdentityHash';
import vectorFileJson from '../../../onchain/test/vectors/identity-hash-vectors.json';

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
const PRIMARY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const PRIMARY_UUID_UPPER = PRIMARY_UUID.toUpperCase();
const NON_ASCII_UUID = '550e8400-e29b-41d4-a716-44665544000é';

function rowFor(uuid: string): IdentityHashVector {
  const row = vectorFile.vectors.find((vector) => vector.uuid === uuid);
  if (!row) {
    throw new Error(`missing identity-hash vector for ${uuid}`);
  }
  return row;
}

describe('identity-hash vectors', () => {
  it('loaded the expected vector fixture', () => {
    expect(vectorFile.description).toContain('identity-hash');
    expect(vectorFile.generatedBy).toBe(
      'plugin/scripts/generate-identity-hash-vectors.ts'
    );
    expect(vectorFile.vectorCount).toBe(vectorFile.vectors.length);
    expect(vectorFile.vectorCount).toBeGreaterThanOrEqual(4);
  });

  for (const vector of vectorFile.vectors) {
    it(`uuid ${vector.uuid}: computeIdentityHash matches vector digest`, () => {
      expect(vector.preimageHex).toMatch(/^0x/);
      expect(computeIdentityHash(vector.uuid)).toBe(vector.digest);
    });
  }

  it('uppercase input canonicalizes to the lowercase twin digest', () => {
    const lower = rowFor(PRIMARY_UUID);
    const upper = rowFor(PRIMARY_UUID_UPPER);

    expect(upper.digest).toBe(lower.digest);
    expect(computeIdentityHash(PRIMARY_UUID_UPPER)).toBe(lower.digest);
  });

  it('canonical UUID primitive rejects uppercase before caller canonicalization', () => {
    expect(() => assertCanonicalV4Uuid(PRIMARY_UUID_UPPER)).toThrow();
  });

  it('rejects whitespace-padded UUIDs without trimming', () => {
    expect(() => computeIdentityHash(` ${PRIMARY_UUID} `)).toThrow();
  });

  it('rejects non-ASCII UUID-shaped strings', () => {
    expect(() => computeIdentityHash(NON_ASCII_UUID)).toThrow();
  });

  it('rejects v1 and nil UUIDs', () => {
    expect(() =>
      computeIdentityHash('c232ab00-9414-11ec-b909-0242ac120002')
    ).toThrow();
    expect(() =>
      computeIdentityHash('00000000-0000-0000-0000-000000000000')
    ).toThrow();
  });
});

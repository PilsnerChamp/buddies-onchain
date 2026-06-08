/**
 * Generate deterministic identity-hash golden vectors.
 *
 * Usage: bun run plugin/scripts/generate-identity-hash-vectors.ts
 * Output: onchain/test/vectors/identity-hash-vectors.json
 *
 * This script MUST remain deterministic:
 * - no randomness
 * - no timestamps
 * - no crypto.randomUUID()
 */

import { concatBytes, keccak256, stringToBytes } from 'viem';

import { assertCanonicalV4Uuid } from '../../shared/assertCanonicalV4Uuid';

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

const DOMAIN_TAG = 'buddies-onchain:identity:claude:v1';
const TAG = stringToBytes(DOMAIN_TAG);
const SEP = Uint8Array.of(0x1f);

const PRIMARY_UUID = '550e8400-e29b-41d4-a716-446655440000';
const LOWERCASE_UUIDS = [
  PRIMARY_UUID,
  '00000000-0000-4000-8000-000000000000',
  'ffffffff-ffff-4fff-bfff-ffffffffffff',
  '11111111-2222-4333-9444-555555555555',
  '22222222-3333-4aaa-abbb-cccccccccccc',
  '89abcdef-0123-4567-89ab-cdef01234567',
  'fedcba98-7654-4321-bfed-cba987654321',
] as const;
const UPPERCASE_UUID = PRIMARY_UUID.toUpperCase();

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}

function createVector(uuid: string): IdentityHashVector {
  const uuidLower = uuid.toLowerCase();
  assertCanonicalV4Uuid(uuidLower);

  const uuidBytes = stringToBytes(uuidLower);
  const preimage = concatBytes([TAG, SEP, uuidBytes]);

  if (TAG.length !== 34 || uuidBytes.length !== 36 || preimage.length !== 71) {
    throw new Error(`preimage invariant for ${uuid}`);
  }

  return {
    uuid,
    preimageHex: bytesToHex(preimage),
    digest: keccak256(preimage),
  };
}

function ensureUniqueUuidRows(vectors: IdentityHashVector[]): void {
  const seen = new Set<string>();
  for (const vector of vectors) {
    if (seen.has(vector.uuid)) {
      throw new Error(`duplicate uuid row: ${vector.uuid}`);
    }
    seen.add(vector.uuid);
  }
}

function assertUppercaseCanonicalization(vectors: IdentityHashVector[]): void {
  const lowercaseTwin = vectors.find((vector) => vector.uuid === PRIMARY_UUID);
  const uppercaseRow = vectors.find((vector) => vector.uuid === UPPERCASE_UUID);

  if (!lowercaseTwin || !uppercaseRow) {
    throw new Error('missing uppercase canonicalization pair');
  }

  if (uppercaseRow.digest !== lowercaseTwin.digest) {
    throw new Error('uppercase row digest differs from lowercase twin');
  }

  if (uppercaseRow.preimageHex !== lowercaseTwin.preimageHex) {
    throw new Error('uppercase row preimage differs from lowercase twin');
  }
}

function buildFixture(): IdentityHashFixture {
  const vectors = [...LOWERCASE_UUIDS, UPPERCASE_UUID].map(createVector);
  ensureUniqueUuidRows(vectors);
  assertUppercaseCanonicalization(vectors);

  return {
    description:
      'Domain-separated identity-hash vectors -- TypeScript and Solidity must match byte-exact',
    generatedBy: 'plugin/scripts/generate-identity-hash-vectors.ts',
    vectorCount: vectors.length,
    vectors,
  };
}

const fixture = buildFixture();
const outputPath = new URL(
  '../../onchain/test/vectors/identity-hash-vectors.json',
  import.meta.url
);

await Bun.write(outputPath, JSON.stringify(fixture, null, 2) + '\n');

console.log(
  `Generated ${fixture.vectorCount} identity-hash vectors to onchain/test/vectors/identity-hash-vectors.json`
);

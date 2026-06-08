// shared/computeIdentityHash.ts
//
// Domain-separated identity hash primitive for hash-only hatch privacy.
// Callers pass an account UUID, this helper lowercases to the canonical v4
// shape, validates that canonical shape, and hashes the fixed 64-byte preimage:
//   "buddies-onchain:identity:v1" || 0x1f || lowercase(uuid)

import { concatBytes, keccak256, stringToBytes } from 'viem';

import { assertCanonicalV4Uuid } from './assertCanonicalV4Uuid';

const TAG = stringToBytes('buddies-onchain:identity:v1');
const SEP = Uint8Array.of(0x1f);

export function computeIdentityHash(uuid: string): `0x${string}` {
  const u = uuid.toLowerCase();
  assertCanonicalV4Uuid(u);

  const uuidBytes = stringToBytes(u);
  const preimage = concatBytes([TAG, SEP, uuidBytes]);

  if (TAG.length !== 27 || uuidBytes.length !== 36 || preimage.length !== 64) {
    throw new Error('preimage invariant');
  }

  return keccak256(preimage);
}

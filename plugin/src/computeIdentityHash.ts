// plugin/src/computeIdentityHash.ts
//
// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Vendored copy of `shared/computeIdentityHash.ts`, produced by `bun run sync-shared`
// (wired into `bun run build`). `shared/` is the source of truth; the site
// imports it directly, the mainnet-only plugin ships this self-contained copy.
// Edit `shared/computeIdentityHash.ts` and re-run `bun run sync-shared` — never hand-edit
// this file. Drift is caught by `plugin/test/vendored-shared-parity.test.ts`
// and `just plugin-check-dist`.
//
// Original doc comments from the shared source follow verbatim.

// Domain-separated identity hash primitive for hash-only hatch privacy.
// Callers pass an account UUID, this helper lowercases to the canonical v4
// shape, validates that canonical shape, and hashes the fixed 71-byte preimage:
//   "buddies-onchain:identity:claude:v1" || 0x1f || lowercase(uuid)

import { concatBytes, keccak256, stringToBytes } from 'viem';

import { assertCanonicalV4Uuid } from './assertCanonicalV4Uuid';

const TAG = stringToBytes('buddies-onchain:identity:claude:v1');
const SEP = Uint8Array.of(0x1f);

export function computeIdentityHash(uuid: string): `0x${string}` {
  const u = uuid.toLowerCase();
  assertCanonicalV4Uuid(u);

  const uuidBytes = stringToBytes(u);
  const preimage = concatBytes([TAG, SEP, uuidBytes]);

  if (TAG.length !== 34 || uuidBytes.length !== 36 || preimage.length !== 71) {
    throw new Error('preimage invariant');
  }

  return keccak256(preimage);
}

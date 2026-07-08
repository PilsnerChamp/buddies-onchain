// plugin/src/assertCanonicalV4Uuid.ts
//
// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Vendored copy of `shared/assertCanonicalV4Uuid.ts`, produced by `bun run sync-shared`
// (wired into `bun run build`). `shared/` is the source of truth; the site
// imports it directly, the mainnet-only plugin ships this self-contained copy.
// Edit `shared/assertCanonicalV4Uuid.ts` and re-run `bun run sync-shared` — never hand-edit
// this file. Drift is caught by `plugin/test/vendored-shared-parity.test.ts`
// and `just plugin-check-dist`.
//
// Original doc comments from the shared source follow verbatim.

// Throw-based RFC 4122 v4-only UUID shape validation for lowercase-canonical
// identity-hash inputs.
//
// This is deliberately stricter than `isValidUuid`: callers lowercase before
// this primitive, and uppercase hex chars must fail here. No whitespace
// trimming — callers trim before canonicalization. The contract remains the
// runtime authority; this helper pins the hash-only hatch preimage shape for
// tests and later caller migrations.

const UUID_LENGTH = 36;
const HYPHEN_0 = 8;
const HYPHEN_1 = 13;
const HYPHEN_2 = 18;
const HYPHEN_3 = 23;

function isHyphenIndex(index: number): boolean {
  return (
    index === HYPHEN_0 ||
    index === HYPHEN_1 ||
    index === HYPHEN_2 ||
    index === HYPHEN_3
  );
}

function isLowerHexCode(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 102);
}

export function assertCanonicalV4Uuid(uuidLower: string): void {
  if (uuidLower.length !== UUID_LENGTH) {
    throw new Error('invalid canonical v4 uuid');
  }

  for (let i = 0; i < UUID_LENGTH; i++) {
    const code = uuidLower.charCodeAt(i);

    if (code > 0x7f) {
      throw new Error('invalid canonical v4 uuid');
    }

    if (isHyphenIndex(i)) {
      if (code !== 45) {
        throw new Error('invalid canonical v4 uuid');
      }
      continue;
    }

    if (!isLowerHexCode(code)) {
      throw new Error('invalid canonical v4 uuid');
    }
  }

  if (uuidLower[14] !== '4') {
    throw new Error('invalid canonical v4 uuid');
  }

  const variant = uuidLower[19];
  if (
    variant !== '8' &&
    variant !== '9' &&
    variant !== 'a' &&
    variant !== 'b'
  ) {
    throw new Error('invalid canonical v4 uuid');
  }
}

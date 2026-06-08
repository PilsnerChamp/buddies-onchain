// shared/isValidUuid.ts
//
// RFC 4122 v4-only UUID shape validation for `accountUuid` values.
// Consumed by:
//   - site `/hatch` route gate in `App.tsx` (redirect on invalid)
//   - site `/view` manual lookup validation before identity-hash resolution
//   - plugin hook/session validation in `plugin/src/index.ts` and
//     `plugin/src/lookup-payload.ts` (soft-fail on invalid identity)
//
// Hoisted to `shared/` so plugin and site reject the same shapes before
// computing the hash-only hatch identity.
//
// Doctrine: BuddyNFT v1 accepts modern random account UUIDs only (RFC 4122
// v4). Future UUID schemes require a new deploy generation. See
// `docs/onchain/contract.md`.
//
// Regex: position-14 nibble locked to `4`, position-19 variant locked to
// `[89ab]`. Rejects v1/v2/v3/v5/v6/v7/v8 and the nil UUID. Case-insensitive
// because plugin output is lowercase but we should not reject an uppercase
// paste; hash callers lowercase before `computeIdentityHash`. No whitespace
// trimming — the caller trims before passing in (see `App.tsx` and
// `plugin/src/lookup-payload.ts`).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

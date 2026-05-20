// site/test/unit/isValidUuid.test.ts
//
// Shape validation for the plugin-originated `accountUuid` query-param.
// Wired into `HatchGate` in `App.tsx`; docs/site/architecture.md § Routes
// documents malformed and missing params redirecting to `/`.
//
// v4-only: position-14 nibble locked to `4`, position-19 variant locked to
// `[89ab]`. Rejects v1/v2/v3/v5/v6/v7/v8 and the nil UUID. Doctrine in
// docs/onchain/contract.md § Invariants.

import { describe, it, expect } from 'vitest';

import { isValidUuid } from '~shared/isValidUuid';

describe('isValidUuid (v4 only)', () => {
  it('accepts a canonical v4 UUID (lowercase)', () => {
    expect(isValidUuid('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
  });

  it('accepts a v4 UUID with variant 8', () => {
    expect(isValidUuid('123e4567-e89b-42d3-8456-426614174000')).toBe(true);
  });

  it('accepts a v4 UUID with variant 9', () => {
    expect(isValidUuid('123e4567-e89b-42d3-9456-426614174000')).toBe(true);
  });

  it('accepts a v4 UUID with variant b', () => {
    expect(isValidUuid('123e4567-e89b-42d3-b456-426614174000')).toBe(true);
  });

  it('accepts a v4 UUID in uppercase (regex is case-insensitive)', () => {
    expect(isValidUuid('123E4567-E89B-42D3-A456-426614174000')).toBe(true);
  });

  it('rejects v1 UUID', () => {
    expect(isValidUuid('c232ab00-9414-11ec-b909-0242ac120002')).toBe(false);
  });

  it('rejects v2 UUID', () => {
    expect(isValidUuid('000003e8-7a83-21ed-9d00-3fdb0085247e')).toBe(false);
  });

  it('rejects v3 UUID', () => {
    expect(isValidUuid('5df41881-3aed-3515-88a7-2f4a814cf09e')).toBe(false);
  });

  it('rejects v5 UUID', () => {
    expect(isValidUuid('2ed6657d-e927-568b-95e1-2665a8aea6a2')).toBe(false);
  });

  it('rejects v6 UUID', () => {
    expect(isValidUuid('1ec9414c-232a-6b00-b3c8-9e6bdeced846')).toBe(false);
  });

  it('rejects v7 UUID (RFC 9562)', () => {
    expect(isValidUuid('017f22e2-79b0-7cc3-98c4-dc0c0c07398f')).toBe(false);
  });

  it('rejects v8 UUID', () => {
    expect(isValidUuid('320c3d4d-cc00-875b-8ec9-32363b3da32d')).toBe(false);
  });

  it('rejects version-zero nibble', () => {
    expect(isValidUuid('123e4567-e89b-02d3-a456-426614174000')).toBe(false);
  });

  it('rejects variant nibble 7 (one below 8)', () => {
    expect(isValidUuid('123e4567-e89b-42d3-7456-426614174000')).toBe(false);
  });

  it('rejects variant nibble c (one above b)', () => {
    expect(isValidUuid('123e4567-e89b-42d3-c456-426614174000')).toBe(false);
  });

  it('rejects the nil UUID', () => {
    expect(isValidUuid('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('rejects a too-short string', () => {
    expect(isValidUuid('123e4567-e89b-42d3-a456-42661417400')).toBe(false);
  });

  it('rejects wrong-separator placement', () => {
    expect(isValidUuid('123e4567e-89b-42d3-a456-426614174000')).toBe(false);
  });

  it('rejects non-string inputs (null/undefined/number/object/array)', () => {
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(123)).toBe(false);
    expect(isValidUuid({})).toBe(false);
    expect(isValidUuid([])).toBe(false);
  });

  it('rejects whitespace-wrapped valid UUID (caller is responsible for trimming)', () => {
    expect(isValidUuid('  123e4567-e89b-42d3-a456-426614174000  ')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isValidUuid('')).toBe(false);
  });
});

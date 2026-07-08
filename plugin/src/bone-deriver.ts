/**
 * Bone derivation pipeline — exact parity with BuddyNFT.hatch.
 *
 * Pipeline:
 * accountUuid + SALT -> wyhash -> 32-bit trait seed -> Mulberry32 PRNG -> traits
 *
 * CROSS-DOMAIN CONTRACT: The Mulberry32 implementation and trait derivation
 * order MUST stay in sync with the Solidity contract. The trait seed is
 * computed client-side and handed to BuddyNFT.hatch unchanged.
 */

import { computeIdentityHash } from "./computeIdentityHash";

// ---------- constants ------------------------------------------------------

export const SALT = "friend-2026-401";

export const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus", "owl", "penguin",
  "turtle", "snail", "ghost", "axolotl", "capybara", "cactus", "robot",
  "rabbit", "mushroom", "chonk",
] as const;

export const EYES = ["·", "✦", "×", "◉", "@", "°"] as const;

export const HATS = [
  "none", "crown", "tophat", "propeller", "halo", "wizard", "beanie", "tinyduck",
] as const;

export const STAT_NAMES = [
  "DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK",
] as const;

export const RARITY_ORDER = [
  "common", "uncommon", "rare", "epic", "legendary",
] as const;

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

export const STAT_BASE: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

// ---------- types ----------------------------------------------------------

export type Species = (typeof SPECIES)[number];
export type Eye = (typeof EYES)[number];
export type Hat = (typeof HATS)[number];
export type StatName = (typeof STAT_NAMES)[number];
export type Rarity = (typeof RARITY_ORDER)[number];

export interface BuddyBones {
  rarity: Rarity;
  species: Species;
  eye: Eye;
  hat: Hat;
  shiny: boolean;
  stats: Record<StatName, number>;
}

// ---------- PRNG -----------------------------------------------------------

export type RNG = () => number;

/**
 * Mulberry32 PRNG — deterministic, 32-bit state.
 * Identical to the implementation in the Claude Code binary and
 * the Solidity contract.
 */
export function makeMulberry32(seed: number): RNG {
  let state = seed >>> 0;
  return function mulberry32(): number {
    state |= 0;
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- helpers --------------------------------------------------------

/** Pick a random element from an array using the PRNG. */
export function pick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Roll rarity using weighted distribution. */
export function rollRarity(rng: RNG): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of RARITY_ORDER) {
    roll -= RARITY_WEIGHTS[r];
    if (roll < 0) return r;
  }
  return "common";
}

// ---------- identity hash --------------------------------------------------

const WYHASH_S0 = 0xa0761d6478bd642fn;
const WYHASH_S1 = 0xe7037ed1a0b428dbn;
const WYHASH_S2 = 0x8ebc6af09c88c6e3n;
const WYHASH_S3 = 0x589965cc75374cc3n;
const WYHASH_MASK64 = 0xffffffffffffffffn;
const WYHASH_MASK32 = 0xffffffffn;
const textEncoder = new TextEncoder();

function u64(value: bigint): bigint {
  return BigInt.asUintN(64, value);
}

function inputBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? textEncoder.encode(input) : input;
}

function mum(a: bigint, b: bigint): [lo: bigint, hi: bigint] {
  const product = u64(a) * u64(b);
  const lo = u64(product & WYHASH_MASK64);
  const hi = u64(product >> 64n);
  return [lo, hi];
}

function mix(a: bigint, b: bigint): bigint {
  const [lo, hi] = mum(a, b);
  return u64(lo ^ hi);
}

function read4(bytes: Uint8Array, offset: number): bigint {
  return (
    BigInt(bytes[offset])
    | (BigInt(bytes[offset + 1]) << 8n)
    | (BigInt(bytes[offset + 2]) << 16n)
    | (BigInt(bytes[offset + 3]) << 24n)
  );
}

function read8(bytes: Uint8Array, offset: number): bigint {
  return (
    BigInt(bytes[offset])
    | (BigInt(bytes[offset + 1]) << 8n)
    | (BigInt(bytes[offset + 2]) << 16n)
    | (BigInt(bytes[offset + 3]) << 24n)
    | (BigInt(bytes[offset + 4]) << 32n)
    | (BigInt(bytes[offset + 5]) << 40n)
    | (BigInt(bytes[offset + 6]) << 48n)
    | (BigInt(bytes[offset + 7]) << 56n)
  );
}

/**
 * Zig std.hash.Wyhash-compatible hash, seed 0, over byte-exact input.
 */
export function wyhash64(input: string | Uint8Array): bigint {
  const bytes = inputBytes(input);
  const len = bytes.length;
  const len64 = u64(BigInt(len));

  let a = 0n;
  let b = 0n;
  let state0 = mix(WYHASH_S0, WYHASH_S1);

  if (len <= 16) {
    if (len >= 4) {
      const end = len - 4;
      const quarter = Math.floor(len / 8) * 4;

      a = u64((read4(bytes, 0) << 32n) | read4(bytes, quarter));
      b = u64((read4(bytes, end) << 32n) | read4(bytes, end - quarter));
    } else if (len > 0) {
      a = u64(
        (BigInt(bytes[0]) << 16n)
        | (BigInt(bytes[len >> 1]) << 8n)
        | BigInt(bytes[len - 1]),
      );
      b = 0n;
    } else {
      a = 0n;
      b = 0n;
    }
  } else {
    let state1 = state0;
    let state2 = state0;
    let i = 0;

    if (len >= 48) {
      while (i + 48 < len) {
        state0 = mix(read8(bytes, i) ^ WYHASH_S1, read8(bytes, i + 8) ^ state0);
        state1 = mix(read8(bytes, i + 16) ^ WYHASH_S2, read8(bytes, i + 24) ^ state1);
        state2 = mix(read8(bytes, i + 32) ^ WYHASH_S3, read8(bytes, i + 40) ^ state2);
        i += 48;
      }

      state0 = u64(state0 ^ state1 ^ state2);
    }

    while (i + 16 < len) {
      state0 = mix(read8(bytes, i) ^ WYHASH_S1, read8(bytes, i + 8) ^ state0);
      i += 16;
    }

    a = read8(bytes, len - 16);
    b = read8(bytes, len - 8);
  }

  a = u64(a ^ WYHASH_S1);
  b = u64(b ^ state0);
  [a, b] = mum(a, b);
  return mix(u64(a ^ WYHASH_S0 ^ len64), u64(b ^ WYHASH_S1));
}

export function wyhash(input: string | Uint8Array): number {
  const h = wyhash64(input);
  return Number(BigInt.asUintN(64, h) & WYHASH_MASK32);
}

/**
 * Derive the 32-bit trait seed from an account UUID.
 *
 * CROSS-DOMAIN: This matches the original body-preserving hatch formula:
 * `WyHash.hash(bytes(accountUuid), bytes(SALT))`.
 *
 * @param accountUuid - Canonical v4 account UUID.
 */
export function deriveTraitSeed(accountUuid: string): number {
  return wyhash(accountUuid + SALT);
}

// ---------- main derivation ------------------------------------------------

/**
 * Derive a buddy's bones (traits) from a 32-bit trait seed.
 * The derivation order is fixed and must never change.
 */
export function deriveBones(rng: RNG): BuddyBones {
  // 1. Rarity (weighted roll)
  const rarity = rollRarity(rng);

  // 2. Species
  const species = pick(rng, SPECIES);

  // 3. Eye style
  const eye = pick(rng, EYES);

  // 4. Hat (common always gets "none")
  const hat: Hat = rarity === "common" ? "none" : pick(rng, HATS);

  // 5. Shiny (1% chance)
  const shiny = rng() < 0.01;

  // 6. Stats
  const base = STAT_BASE[rarity];
  const primary = pick(rng, STAT_NAMES);
  let secondary = pick(rng, STAT_NAMES);
  while (secondary === primary) secondary = pick(rng, STAT_NAMES);

  const stats = {} as Record<StatName, number>;
  for (const s of STAT_NAMES) {
    if (s === primary) {
      stats[s] = Math.min(100, base + 50 + Math.floor(rng() * 30));
    } else if (s === secondary) {
      stats[s] = Math.max(1, base - 10 + Math.floor(rng() * 15));
    } else {
      stats[s] = base + Math.floor(rng() * 40);
    }
  }

  return { rarity, species, eye, hat, shiny, stats };
}

/**
 * Full pipeline: accountUuid -> trait seed (wyhash) + identityHash (keccak) -> PRNG -> bones.
 * The seed and the identity hash are two independent derivations from the UUID
 * (Decision 8); the seed drives bones, the hash is the privacy/lookup key.
 *
 * @param accountUuid - Canonical v4 account UUID.
 */
export function deriveBuddyFromAccount(accountUuid: string): {
  identityHash: `0x${string}`;
  traitSeed: number;
  bones: BuddyBones;
} {
  const identityHash = computeIdentityHash(accountUuid);
  const traitSeed = deriveTraitSeed(accountUuid);
  const rng = makeMulberry32(traitSeed);
  const bones = deriveBones(rng);
  return { identityHash, traitSeed, bones };
}

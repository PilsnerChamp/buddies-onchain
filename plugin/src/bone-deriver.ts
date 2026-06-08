/**
 * Bone derivation pipeline — exact parity with BuddyNFT.hatch.
 *
 * Pipeline:
 * accountUuid -> §2 keccak identityHash -> raw32 || SEED_DOMAIN -> wyhash
 * -> 32-bit trait seed -> Mulberry32 PRNG -> traits
 *
 * CROSS-DOMAIN CONTRACT: The Mulberry32 implementation and trait derivation
 * order MUST stay in sync with the Solidity contract. The trait seed preimage
 * MUST stay byte-exact with BuddyNFT.hatch: raw identityHash bytes, not the
 * "0x…" string or hex characters.
 */

import { concatBytes, hexToBytes, stringToBytes } from "viem";

import { computeIdentityHash } from "~shared/computeIdentityHash";

// ---------- constants ------------------------------------------------------

export const SEED_DOMAIN = "buddies-onchain:trait-seed:v2";

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

/**
 * wyhash — used by compiled Bun binary installs of Claude Code.
 * Delegates to Bun.hash over the byte-exact input, truncated to 32 bits.
 */
export function wyhash(input: string | Uint8Array): number {
  return Number(BigInt.asUintN(64, BigInt(Bun.hash(input))) & 0xffffffffn);
}

/**
 * Derive the 32-bit trait seed from an account UUID.
 *
 * CROSS-DOMAIN: This matches BuddyNFT.hatch:
 * `WyHash.hash(abi.encodePacked(identityHash), bytes(SEED_DOMAIN))`.
 *
 * @param accountUuid - Canonical v4 account UUID.
 */
export function deriveTraitSeed(accountUuid: string): number {
  const identityHash = computeIdentityHash(accountUuid);
  const seedInput = concatBytes([
    hexToBytes(identityHash),
    stringToBytes(SEED_DOMAIN),
  ]);
  return wyhash(seedInput);
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
 * Full pipeline: accountUuid -> identityHash -> trait seed -> PRNG -> bones.
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

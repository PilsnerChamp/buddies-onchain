/**
 * Tests for the canonical wyhash -> Mulberry32 bone derivation pipeline.
 */

import { describe, test, expect } from "bun:test";
import { concatBytes, hexToBytes, stringToBytes } from "viem";

import {
  makeMulberry32,
  pick,
  rollRarity,
  deriveBones,
  deriveTraitSeed,
  deriveBuddyFromAccount,
  wyhash,
  SEED_DOMAIN,
  SPECIES,
  EYES,
  STAT_NAMES,
  type BuddyBones,
} from "../src/bone-deriver";

// ---------- test vectors ---------------------------------------------------

const TEST_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
const TEST_IDENTITY_HASH =
  "0x11c1f0ff5f3422e0e9c64abda3c02ca65cb05b5fe768946f7f3f7b89ae3667f6";
const TEST_SEED_INPUT_HEX =
  "0x11c1f0ff5f3422e0e9c64abda3c02ca65cb05b5fe768946f7f3f7b89ae3667f6627564646965732d6f6e636861696e3a74726169742d736565643a7632";

const WYHASH_HASH = 4116242804;
const WYHASH_BONES: BuddyBones = {
  rarity: "common",
  species: "duck",
  eye: "◉",
  hat: "none",
  shiny: false,
  stats: {
    DEBUGGING: 84,
    PATIENCE: 24,
    CHAOS: 4,
    WISDOM: 36,
    SNARK: 23,
  },
};

// ===========================================================================
// Hash function
// ===========================================================================

describe("wyhash (Bun.hash)", () => {
  test("produces correct 32-bit hash for test vector", () => {
    const seedInput = concatBytes([
      hexToBytes(TEST_IDENTITY_HASH),
      stringToBytes(SEED_DOMAIN),
    ]);
    const hash = wyhash(seedInput);
    expect(hash).toBe(WYHASH_HASH);
  });

  test("result is always a positive 32-bit integer", () => {
    const inputs = [
      "",
      "hello",
      "a".repeat(1000),
      hexToBytes(TEST_SEED_INPUT_HEX),
    ];
    for (const input of inputs) {
      const h = wyhash(input);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe("deriveTraitSeed", () => {
  test("uses the correct seed domain", () => {
    expect(SEED_DOMAIN).toBe("buddies-onchain:trait-seed:v2");
  });

  test("matches raw identityHash bytes plus seed-domain test vector", () => {
    const seed = deriveTraitSeed(TEST_UUID);
    expect(seed).toBe(WYHASH_HASH);
  });

  test("seed is always a positive 32-bit integer for valid UUIDs", () => {
    const uuids = [
      "00000000-0000-4000-8000-000000000000",
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
      TEST_UUID,
    ];
    for (const uuid of uuids) {
      const seed = deriveTraitSeed(uuid);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(seed)).toBe(true);
    }
  });

  test("rejects invalid UUIDs before seed derivation", () => {
    expect(() => deriveTraitSeed("anon")).toThrow();
  });
});

// ===========================================================================
// Mulberry32 PRNG
// ===========================================================================

describe("makeMulberry32", () => {
  test("is deterministic — same seed produces same sequence", () => {
    const rng1 = makeMulberry32(12345);
    const rng2 = makeMulberry32(12345);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  test("produces values in [0, 1)", () => {
    const rng = makeMulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("different seeds produce different sequences", () => {
    const rng1 = makeMulberry32(1);
    const rng2 = makeMulberry32(2);
    let allSame = true;
    for (let i = 0; i < 10; i++) {
      if (rng1() !== rng2()) allSame = false;
    }
    expect(allSame).toBe(false);
  });
});

// ===========================================================================
// Helpers
// ===========================================================================

describe("pick", () => {
  test("always returns an element from the array", () => {
    const rng = makeMulberry32(999);
    const arr = ["a", "b", "c", "d"];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(pick(rng, arr));
    }
  });
});

describe("rollRarity", () => {
  test("always returns a valid rarity", () => {
    const validRarities = ["common", "uncommon", "rare", "epic", "legendary"];
    const rng = makeMulberry32(77777);
    for (let i = 0; i < 500; i++) {
      expect(validRarities).toContain(rollRarity(rng));
    }
  });

  test("distribution roughly matches weights over many rolls", () => {
    const counts: Record<string, number> = {
      common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0,
    };
    for (let seed = 0; seed < 10000; seed++) {
      const rng = makeMulberry32(seed);
      counts[rollRarity(rng)]++;
    }
    expect(counts.common).toBeGreaterThan(4000);
    expect(counts.uncommon).toBeGreaterThan(1500);
    expect(counts.rare).toBeGreaterThan(500);
    expect(counts.epic).toBeGreaterThan(100);
  });
});

// ===========================================================================
// deriveBones
// ===========================================================================

describe("deriveBones", () => {
  test("matches the canonical wyhash test vector exactly", () => {
    const rng = makeMulberry32(WYHASH_HASH);
    const bones = deriveBones(rng);

    expect(bones.rarity).toBe(WYHASH_BONES.rarity);
    expect(bones.species).toBe(WYHASH_BONES.species);
    expect(bones.eye).toBe(WYHASH_BONES.eye);
    expect(bones.hat).toBe(WYHASH_BONES.hat);
    expect(bones.shiny).toBe(WYHASH_BONES.shiny);

    for (const stat of STAT_NAMES) {
      expect(bones.stats[stat]).toBe(WYHASH_BONES.stats[stat]);
    }
  });

  test("all stats are between 1 and 100", () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = makeMulberry32(seed);
      const bones = deriveBones(rng);
      for (const stat of STAT_NAMES) {
        expect(bones.stats[stat]).toBeGreaterThanOrEqual(1);
        expect(bones.stats[stat]).toBeLessThanOrEqual(100);
      }
    }
  });

  test("species is always from the valid set", () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = makeMulberry32(seed);
      const bones = deriveBones(rng);
      expect(SPECIES as readonly string[]).toContain(bones.species);
    }
  });

  test("eye is always from the valid set", () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = makeMulberry32(seed);
      const bones = deriveBones(rng);
      expect(EYES as readonly string[]).toContain(bones.eye);
    }
  });
});

// ===========================================================================
// Full pipeline (end-to-end)
// ===========================================================================

describe("deriveBuddyFromAccount", () => {
  test("end-to-end matches wyhash test vector", () => {
    const { identityHash, traitSeed, bones } = deriveBuddyFromAccount(TEST_UUID);

    expect(identityHash).toBe(TEST_IDENTITY_HASH);
    expect(traitSeed).toBe(WYHASH_HASH);
    expect(bones.rarity).toBe("common");
    expect(bones.species).toBe("duck");
    expect(bones.eye).toBe("◉");
    expect(bones.hat).toBe("none");
    expect(bones.shiny).toBe(false);
    expect(bones.stats.DEBUGGING).toBe(84);
  });

  test("same valid UUID is deterministic", () => {
    const a = deriveBuddyFromAccount(TEST_UUID);
    const b = deriveBuddyFromAccount(TEST_UUID);
    expect(a.identityHash).toBe(TEST_IDENTITY_HASH);
    expect(a.identityHash).toBe(b.identityHash);
    expect(a.traitSeed).toBe(b.traitSeed);
    expect(a.bones).toEqual(b.bones);
  });
});

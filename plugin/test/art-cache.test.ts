import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  BuddyArtCacheWriteError,
  artCachePath,
  cacheMatchesIdentityAndToken,
  clearArtCache,
  readArtCache,
  writeArtCache,
  type BuddyArtCacheV1,
} from "../src/art-cache";
import type { IdentityTuple } from "../src/buddy-state";

const ID_A: IdentityTuple = {
  accountUuidHash: "a".repeat(64),
  chainId: 31337,
  contractAddress: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
};

const ID_B: IdentityTuple = {
  accountUuidHash: "b".repeat(64),
  chainId: 31337,
  contractAddress: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
};

const tmpDirs: string[] = [];
let originalClaudeDir: string | undefined;

function freshTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "buddy-art-cache-"));
  tmpDirs.push(dir);
  return dir;
}

function sampleCache(overrides: Partial<BuddyArtCacheV1> = {}): BuddyArtCacheV1 {
  return {
    schemaVersion: 1,
    accountUuidHash: ID_A.accountUuidHash!,
    chainId: ID_A.chainId!,
    contractAddress: ID_A.contractAddress!,
    tokenId: "0x2a",
    frames: {
      f0: ["  .[||].", " [ -  - ]"],
      f1: ["  .[||].", " [ o  - ]"],
    },
    cachedAtMs: 12345,
    ...overrides,
  };
}

function writeRaw(raw: unknown): void {
  mkdirSync(dirname(artCachePath()), { recursive: true });
  writeFileSync(artCachePath(), JSON.stringify(raw));
}

beforeEach(() => {
  originalClaudeDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = freshTmp();
});

afterEach(() => {
  if (originalClaudeDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir;
  }

  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("readArtCache / writeArtCache", () => {
  test("missing cache returns null", () => {
    expect(readArtCache()).toBeNull();
  });

  test("malformed JSON returns null", () => {
    mkdirSync(dirname(artCachePath()), { recursive: true });
    writeFileSync(artCachePath(), "{ not json");

    expect(readArtCache()).toBeNull();
  });

  test("target symlink returns null", () => {
    if (process.platform === "win32") {
      return;
    }

    const real = join(process.env.CLAUDE_CONFIG_DIR!, "real-cache.json");
    writeFileSync(real, JSON.stringify(sampleCache()));

    mkdirSync(dirname(artCachePath()), { recursive: true });
    symlinkSync(real, artCachePath());

    expect(readArtCache()).toBeNull();
  });

  test("write/read roundtrip preserves cached frame rows", () => {
    const cache = sampleCache();

    writeArtCache(cache);

    expect(readArtCache()).toEqual(cache);
  });

  test("oversize cache file returns null", () => {
    mkdirSync(dirname(artCachePath()), { recursive: true });
    const huge = sampleCache({
      frames: { f0: ["x".repeat(40 * 1024)] },
    });
    writeFileSync(artCachePath(), JSON.stringify(huge));

    expect(readArtCache()).toBeNull();
  });

  test("parent-dir symlink returns null", () => {
    if (process.platform === "win32") {
      return;
    }

    const buddyDir = dirname(artCachePath());
    mkdirSync(dirname(buddyDir), { recursive: true });
    rmSync(buddyDir, { recursive: true, force: true });

    const realDir = join(process.env.CLAUDE_CONFIG_DIR!, "real-buddy-dir");
    mkdirSync(realDir, { recursive: true });
    writeFileSync(join(realDir, ".buddy-art-cache.json"), JSON.stringify(sampleCache()));

    symlinkSync(realDir, buddyDir);

    expect(readArtCache()).toBeNull();
  });
});

describe("clearArtCache", () => {
  test("deletes an existing cache file", () => {
    writeArtCache(sampleCache());

    expect(existsSync(artCachePath())).toBe(true);

    clearArtCache();

    expect(existsSync(artCachePath())).toBe(false);
    expect(readArtCache()).toBeNull();
  });

  test("does not throw when the cache file is missing", () => {
    expect(existsSync(artCachePath())).toBe(false);

    expect(() => clearArtCache()).not.toThrow();
  });
});

describe("validator", () => {
  test("rejects extra top-level fields", () => {
    writeRaw({ ...sampleCache(), extra: "nope" });

    expect(readArtCache()).toBeNull();
  });

  test("rejects missing fields", () => {
    const { frames: _frames, ...missingFrames } = sampleCache();
    writeRaw(missingFrames);

    expect(readArtCache()).toBeNull();
  });

  test("rejects wrong field types", () => {
    writeRaw(sampleCache({ frames: { f0: ["ok"], f1: [42 as never] } }));
    expect(readArtCache()).toBeNull();

    writeRaw(sampleCache({ tokenId: "0xZZ" }));
    expect(readArtCache()).toBeNull();

    writeRaw(sampleCache({ accountUuidHash: "not-sha256" }));
    expect(readArtCache()).toBeNull();
  });

  test("invalid write throws a typed cache error", () => {
    expect(() =>
      writeArtCache(sampleCache({ tokenId: "0xZZ" })),
    ).toThrow(BuddyArtCacheWriteError);
  });
});

describe("cacheMatchesIdentityAndToken", () => {
  test("true only for matching account, chain, contract, and token", () => {
    const cache = sampleCache();

    expect(cacheMatchesIdentityAndToken(cache, ID_A, "0x2a")).toBe(true);
    expect(cacheMatchesIdentityAndToken(cache, ID_A, 42n)).toBe(true);
  });

  test("detects account mismatch", () => {
    expect(cacheMatchesIdentityAndToken(sampleCache(), ID_B, "0x2a")).toBe(false);
  });

  test("detects chain mismatch", () => {
    const identity: IdentityTuple = { ...ID_A, chainId: 8453 };

    expect(cacheMatchesIdentityAndToken(sampleCache(), identity, "0x2a")).toBe(false);
  });

  test("detects contract mismatch", () => {
    const identity: IdentityTuple = {
      ...ID_A,
      contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    expect(cacheMatchesIdentityAndToken(sampleCache(), identity, "0x2a")).toBe(false);
  });

  test("detects token mismatch or missing token", () => {
    const cache = sampleCache();

    expect(cacheMatchesIdentityAndToken(cache, ID_A, "0x2b")).toBe(false);
    expect(cacheMatchesIdentityAndToken(cache, ID_A, null)).toBe(false);
  });
});

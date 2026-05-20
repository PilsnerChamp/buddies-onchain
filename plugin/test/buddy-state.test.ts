import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BuddyStateWriteError,
  modeFooterSentence,
  defaultState,
  derivedEveryNth,
  getEnvMode,
  mutateState,
  readState,
  statePath,
  validateStateV4,
  type BuddyStateV4,
} from "../src/buddy-state";

const tmpDirs: string[] = [];
let originalClaudeDir: string | undefined;
let originalMode: string | undefined;

function freshTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "buddy-state-"));
  tmpDirs.push(d);
  return d;
}

function useClaudeDir(): string {
  const dir = freshTmp();
  process.env.CLAUDE_CONFIG_DIR = dir;
  mkdirSync(dirname(statePath()), { recursive: true });
  return dir;
}

function writeRaw(raw: unknown): void {
  mkdirSync(dirname(statePath()), { recursive: true });
  writeFileSync(statePath(), JSON.stringify(raw));
}

function state(overrides: Partial<BuddyStateV4> = {}): BuddyStateV4 {
  return { ...defaultState(), ...overrides };
}

const ID_A = { accountUuidHash: "a".repeat(64), chainId: 8453, contractAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" };
const ID_B = { accountUuidHash: "b".repeat(64), chainId: 8453, contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };

beforeEach(() => {
  originalClaudeDir = process.env.CLAUDE_CONFIG_DIR;
  originalMode = process.env.BUDDY_MODE;
  delete process.env.BUDDY_MODE;
  useClaudeDir();
});

afterEach(() => {
  if (originalClaudeDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = originalClaudeDir;
  if (originalMode === undefined) delete process.env.BUDDY_MODE;
  else process.env.BUDDY_MODE = originalMode;
  while (tmpDirs.length > 0) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("statePath", () => {
  test("honors CLAUDE_CONFIG_DIR", () => {
    expect(statePath().endsWith("plugins/buddy-onchain/.buddy-state")).toBe(true);
    expect(statePath().startsWith(process.env.CLAUDE_CONFIG_DIR!)).toBe(true);
  });
});

describe("defaultState", () => {
  test("defaults mode/hatch/token", () => {
    expect(defaultState()).toEqual({
      schemaVersion: 4,
      mode: "full",
      hatch: "unknown",
      tokenId: null,
      accountUuidHash: null,
      chainId: null,
      contractAddress: null,
      turnCounter: 0,
      coldNudgeCounter: 0,
    });
  });
});

describe("validateStateV4", () => {
  test("accepts v4 state with coldNudgeCounter=0", () => {
    expect(validateStateV4(state({ coldNudgeCounter: 0 }))).toEqual(
      state({ coldNudgeCounter: 0 }),
    );
  });

  test.each(["off", "lite", "full"] as const)("accepts mode=%s", (mode) => {
    expect(validateStateV4(state({ mode }))).toEqual(state({ mode }));
  });

  test.each(["unknown", "cold", "warm"] as const)("accepts hatch=%s with valid token shape", (hatch) => {
    const tokenId = hatch === "warm" ? "0xAB" : null;
    expect(validateStateV4(state({ hatch, tokenId }))).toEqual(state({ hatch, tokenId: tokenId?.toLowerCase() ?? null }));
  });

  test("rejects exact-schema drift", () => {
    expect(validateStateV4({ ...state(), extra: "nope" })).toBeNull();
    const raw: Record<string, unknown> = { ...state() };
    delete raw.tokenId;
    expect(validateStateV4(raw)).toBeNull();
  });

  test("rejects missing or negative coldNudgeCounter", () => {
    expect(validateStateV4(state({ coldNudgeCounter: -1 }))).toBeNull();
    const raw: Record<string, unknown> = { ...state() };
    delete raw.coldNudgeCounter;
    expect(validateStateV4(raw)).toBeNull();
  });

  test("rejects v3 schema hard cut", () => {
    // schemaVersion check fires
    expect(validateStateV4({
      ...state(),
      schemaVersion: 3,
    })).toBeNull();
    // strict-keys check fires (v3 shape lacking coldNudgeCounter, even with v4 schemaVersion)
    const legacyShapeV4Tag: Record<string, unknown> = {
      ...state(),
      schemaVersion: 4,
    };
    delete legacyShapeV4Tag.coldNudgeCounter;
    expect(validateStateV4(legacyShapeV4Tag)).toBeNull();
    // both fire together (legacy v3 on disk: v3 tag + missing counter)
    const legacyV3: Record<string, unknown> = {
      ...state(),
      schemaVersion: 3,
    };
    delete legacyV3.coldNudgeCounter;
    expect(validateStateV4(legacyV3)).toBeNull();
  });

  test("rejects invalid warm/non-warm token combinations", () => {
    expect(validateStateV4(state({ hatch: "warm", tokenId: null }))).toBeNull();
    expect(validateStateV4(state({ hatch: "warm", tokenId: "not-hex" }))).toBeNull();
    expect(validateStateV4(state({ hatch: "cold", tokenId: "0x2a" }))).toBeNull();
    expect(validateStateV4(state({ hatch: "unknown", tokenId: "0x2a" }))).toBeNull();
  });
});

describe("readState", () => {
  test("old v1 presence-only state is ignored gracefully", () => {
    writeRaw({ schemaVersion: 1, presence: "lite" });
    expect(readState()).toBeNull();
  });

  test("v2 state with presence field is ignored gracefully", () => {
    writeRaw({
      schemaVersion: 2,
      presence: "lite",
      ...ID_A,
      hatch: "warm",
      tokenId: "0x2a",
      turnCounter: 0,
    });
    expect(readState()).toBeNull();
  });

  test("missing, corrupt, or invalid state returns null", () => {
    expect(readState()).toBeNull();
    writeFileSync(statePath(), "not json");
    expect(readState()).toBeNull();
    writeRaw({ schemaVersion: 4, mode: "ultra" });
    expect(readState()).toBeNull();
  });

  test("rejects v4 extras and oversize files", () => {
    writeRaw({ ...state(), extra: "nope" });
    expect(readState()).toBeNull();
    writeFileSync(statePath(), JSON.stringify({ ...state(), pad: "x".repeat(9 * 1024) }));
    expect(readState()).toBeNull();
  });

  test("reads normalized v4 and lowercases contract/token hex", () => {
    writeRaw(state({ ...ID_A, hatch: "warm", tokenId: "0xAB" }));
    expect(readState()).toEqual(state({ ...ID_A, hatch: "warm", tokenId: "0xab" }));
  });

  // Seed non-default `lite` so the assertion fails if `readState` silently
  // rewrites persisted mode to the default `full`.
  test("persisted v4 mode=lite reads through unchanged", () => {
    const persisted = state({ mode: "lite" });
    writeRaw(persisted);
    expect(readState()?.mode).toBe("lite");
    expect(readState()).toEqual(persisted);
  });

  test("refuses target symlink", () => {
    if (process.platform === "win32") return;
    const real = join(process.env.CLAUDE_CONFIG_DIR!, "real.json");
    writeFileSync(real, JSON.stringify(state()));
    rmSync(statePath(), { force: true });
    symlinkSync(real, statePath());
    expect(readState()).toBeNull();
  });

  test("refuses parent-dir symlink", () => {
    if (process.platform === "win32") return;
    const buddyDir = dirname(statePath());
    const real = join(process.env.CLAUDE_CONFIG_DIR!, "real-buddy-dir");
    rmSync(buddyDir, { recursive: true, force: true });
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, ".buddy-state"), JSON.stringify(state()));
    symlinkSync(real, buddyDir);
    expect(readState()).toBeNull();
    expect(() => mutateState((current) => current)).toThrow(BuddyStateWriteError);
  });
});

describe("mutateState", () => {
  test("writes v4 state from default when no file exists", () => {
    const next = mutateState((current) => ({ ...current, mode: "lite" }));
    expect(next).toEqual(state({ mode: "lite" }));
    expect(JSON.parse(readFileSync(statePath(), "utf8"))).toEqual(next);
  });

  test("old v1 on disk resets through default state on mutate", () => {
    writeRaw({ schemaVersion: 1, presence: "lite" });
    const next = mutateState((current) => current);
    expect(next).toEqual(defaultState());
    expect(JSON.parse(readFileSync(statePath(), "utf8"))).toEqual(defaultState());
  });

  test("v2 state with presence resets through default state on mutate", () => {
    writeRaw({
      schemaVersion: 2,
      presence: "lite",
      ...ID_A,
      hatch: "warm",
      tokenId: "0x2a",
      turnCounter: 0,
    });
    const next = mutateState((current) => ({ ...current, mode: "off" }));
    expect(next).toEqual(state({ mode: "off" }));
  });

  test("v3 state resets through default state on mutate", () => {
    writeRaw({
      schemaVersion: 3,
      ...ID_A,
      hatch: "cold",
      mode: "lite",
      tokenId: null,
      turnCounter: 7,
    });
    const next = mutateState((current) => ({ ...current, mode: "off" }));
    expect(next).toEqual(state({ mode: "off" }));
  });

  test("writes 0600 permissions on POSIX", () => {
    if (process.platform === "win32") return;
    mutateState((current) => ({ ...current, mode: "full" }));
    expect(lstatSync(statePath()).mode & 0o777).toBe(0o600);
  });

  test("first write seeds identity from default-state nulls without reset", () => {
    const next = mutateState((current) => ({
      ...current,
      ...ID_A,
      hatch: "warm",
      tokenId: "0xfeed",
    }));
    expect(next).toMatchObject({
      ...ID_A,
      hatch: "warm",
      tokenId: "0xfeed",
    });
  });

  test("preserveKnownHatchOnUnknown defaults true and keeps warm for same-identity unknown", () => {
    writeRaw(state({ ...ID_A, hatch: "warm", tokenId: "0x2a" }));
    const next = mutateState((current) => ({ ...current, mode: "lite", hatch: "unknown", tokenId: null }));
    expect(next).toMatchObject({ mode: "lite", hatch: "warm", tokenId: "0x2a" });
  });

  test("preserveKnownHatchOnUnknown=false lets same-identity unknown demote warm", () => {
    writeRaw(state({ ...ID_A, hatch: "warm", tokenId: "0x2a" }));
    const next = mutateState(
      (current) => ({
        ...current,
        hatch: "unknown",
        tokenId: null,
      }),
      { preserveKnownHatchOnUnknown: false },
    );
    expect(next).toMatchObject({ hatch: "unknown", tokenId: null });
  });

  test("preserveKnownHatchOnUnknown=false does not demote cold (warm-specific gate)", () => {
    writeRaw(state({
      ...ID_A,
      hatch: "cold",
      tokenId: null,
    }));
    const next = mutateState(
      (current) => ({
        ...current,
        hatch: "unknown",
      }),
      { preserveKnownHatchOnUnknown: false },
    );
    expect(next).toMatchObject({ hatch: "cold", tokenId: null });
  });

  test("fresh confirmed cold downgrades warm cache (burn / migration safety)", () => {
    // Warm-sticky must NOT preserve warm against a candidate `cold` — that's
    // a successful RPC saying tokenId=0 (burn / contract migration / chain
    // reset). Preserving warm there would lie about chain truth.
    writeRaw(state({ ...ID_A, hatch: "warm", tokenId: "0x2a" }));
    const next = mutateState((current) => ({
      ...current,
      hatch: "cold",
      tokenId: null,
    }));
    expect(next).toMatchObject({ hatch: "cold", tokenId: null });
  });

  test("identity mismatch resets hatch data but preserves mode", () => {
    writeRaw(state({
      ...ID_A,
      mode: "lite",
      hatch: "warm",
      tokenId: "0x2a",
      coldNudgeCounter: 9,
    }));
    const next = mutateState((current) => ({
      ...current,
      ...ID_B,
    }));
    expect(next).toEqual(state({
      ...ID_B,
      mode: "lite",
      hatch: "unknown",
      tokenId: null,
      coldNudgeCounter: 0,
    }));
  });

  test("non-warm transform clears tokenId", () => {
    writeRaw(state({ ...ID_A, hatch: "cold", tokenId: null }));
    const next = mutateState((current) => ({ ...current, hatch: "cold", tokenId: "0x2a" }));
    expect(next).toMatchObject({ hatch: "cold", tokenId: null });
  });

  test("turnCounter never moves backward", () => {
    writeRaw(state({ turnCounter: 10 }));
    const next = mutateState((current) => ({ ...current, turnCounter: 1 }));
    expect(next.turnCounter).toBe(10);
  });

  test("coldNudgeCounter never moves backward for stable identity", () => {
    writeRaw(state({ ...ID_A, coldNudgeCounter: 10 }));
    const next = mutateState((current) => ({
      ...current,
      coldNudgeCounter: 1,
    }));
    expect(next.coldNudgeCounter).toBe(10);
  });

  test("resetColdNudgeCounter policy forces counter to zero", () => {
    writeRaw(state({ ...ID_A, coldNudgeCounter: 10 }));
    const next = mutateState(
      (current) => ({
        ...current,
        coldNudgeCounter: 0,
      }),
      { resetColdNudgeCounter: true },
    );
    expect(next.coldNudgeCounter).toBe(0);
  });

  test("throws typed error on persistent write failure", () => {
    if (process.platform === "win32") return;
    const real = join(process.env.CLAUDE_CONFIG_DIR!, "real.json");
    writeFileSync(real, "{}", "utf8");
    symlinkSync(real, statePath());
    expect(() => mutateState((current) => current)).toThrow(BuddyStateWriteError);
  });

  test("throws on invalid transform and preserves prior state", () => {
    const first = mutateState((current) => ({ ...current, mode: "full" }));
    expect(() => mutateState((current) => ({ ...current, mode: "ultra" as never }))).toThrow(BuddyStateWriteError);
    expect(() => mutateState((current) => ({ ...current, extra: "nope" } as never))).toThrow(BuddyStateWriteError);
    expect(readState()).toEqual(first);
  });

  test("throws on permission-denied parent dir", () => {
    if (process.platform === "win32") return;
    if (typeof process.getuid === "function" && process.getuid() === 0) return;
    const buddyDir = dirname(statePath());
    chmodSync(buddyDir, 0o500);
    try {
      expect(() => mutateState((current) => current)).toThrow(BuddyStateWriteError);
    } finally {
      chmodSync(buddyDir, 0o700);
    }
  });
});

describe("helpers", () => {
  test.each([["full", 1], ["lite", 3], ["off", Number.POSITIVE_INFINITY]] as const)(
    "derivedEveryNth(%s) -> %s",
    (mode, expected) => expect(derivedEveryNth(mode)).toBe(expected),
  );

  test.each([
    ["full", "your buddy appears on every user prompt (mode: `full`)."],
    ["lite", "your buddy appears every 3rd prompt (mode: `lite`)."],
    ["off", "your buddy is silent on prompts (mode: `off`)."],
  ] as const)("modeFooterSentence(%s) -> %p", (mode, expected) => {
    expect(modeFooterSentence(mode)).toBe(expected);
  });

  test("getEnvMode validates BUDDY_MODE", () => {
    process.env.BUDDY_MODE = "off";
    expect(getEnvMode()).toBe("off");
    process.env.BUDDY_MODE = "Lite";
    expect(getEnvMode()).toBe("lite");
    process.env.BUDDY_MODE = "full";
    expect(getEnvMode()).toBe("full");
    process.env.BUDDY_MODE = "ultra";
    expect(getEnvMode()).toBeNull();
    process.env.BUDDY_MODE = "";
    expect(getEnvMode()).toBeNull();
    delete process.env.BUDDY_MODE;
    expect(getEnvMode()).toBeNull();
  });
});

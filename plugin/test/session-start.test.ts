// SessionStart hook tests exercise the bundled `dist/index.js` for CLI flag
// behavior and source-level subprocess harnesses for chain-state branches.
// Source harnesses install the publicClient test seam before importing the
// SessionStart entry, keeping mode/state cases hermetic.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { RULESET_AMBIENT } from "../src/instructions";
import type { BuddyStateV4, HatchState, IdentityTuple, ModeLevel } from "../src/buddy-state";

const TEST_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
const PLUGIN_ROOT = join(import.meta.dir, "..");
const DIST = join(PLUGIN_ROOT, "dist", "index.js");

const MAINNET_IDENTITY: IdentityTuple = {
  accountUuidHash: createHash("sha256").update(TEST_UUID).digest("hex"),
  chainId: 8453,
  contractAddress: null,
};

const LOCAL_IDENTITY: IdentityTuple = {
  accountUuidHash: createHash("sha256").update(TEST_UUID).digest("hex"),
  chainId: 31337,
  contractAddress: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
};

const tmpRoots: string[] = [];

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function freshClaudeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buddy-session-start-"));
  tmpRoots.push(root);

  mkdirSync(join(root, "plugins", "buddy-onchain"), { recursive: true });
  writeClaudeConfig(root, TEST_UUID);
  writeSettings(root, { statusLine: { type: "command", command: "existing" } });

  return root;
}

function freshDeploymentsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "buddy-session-deployments-"));
  tmpRoots.push(dir);
  return dir;
}

function writeClaudeConfig(root: string, accountUuid: string): void {
  writeFileSync(
    join(root, ".claude.json"),
    JSON.stringify({ oauthAccount: { accountUuid } }),
  );
}

function writeSettings(root: string, settings: unknown): void {
  writeFileSync(join(root, "settings.json"), JSON.stringify(settings));
}

function statePath(root: string): string {
  return join(root, "plugins", "buddy-onchain", ".buddy-state");
}

function artCachePath(root: string): string {
  return join(root, "plugins", "buddy-onchain", ".buddy-art-cache.json");
}

function driftFlagPath(root: string): string {
  return join(root, "plugins", "buddy-onchain", "repeat-buddy-instructions.flag");
}

function expectedRenderFlagPath(root: string): string {
  return join(root, "plugins", "buddy-onchain", "expected-render.flag");
}

function seedDriftFlag(root: string): void {
  writeFileSync(driftFlagPath(root), "");
}

function seedExpectedRenderFlag(root: string): void {
  writeFileSync(expectedRenderFlagPath(root), "");
}

function readArtCacheFile(root: string): unknown | null {
  try {
    return JSON.parse(readFileSync(artCachePath(root), "utf8"));
  } catch {
    return null;
  }
}

function seedState(
  root: string,
  identity: IdentityTuple,
  hatch: HatchState,
  mode: ModeLevel,
): void {
  const state: BuddyStateV4 = {
    schemaVersion: 4,
    mode,
    hatch,
    tokenId: hatch === "warm" ? "0xfeed" : null,
    accountUuidHash: identity.accountUuidHash,
    chainId: identity.chainId,
    contractAddress: identity.contractAddress,
    turnCounter: 0,
    coldNudgeCounter: 0,
  };

  writeFileSync(statePath(root), JSON.stringify(state));
}

async function runSessionStart(
  root: string,
  env: Record<string, string> = {},
  extraArgs: string[] = [],
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", DIST, "--session-start", ...extraArgs], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: root,
      CLAUDE_CONFIG_DIR: root,
      BUDDY_NETWORK: "mainnet",
      ...env,
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

function makeTokenUri(): string {
  const frame = (id: string, rows: string[]) => [
    `<g id="${id}">`,
    ...rows.map((row) => `<text class="sprite">${row}</text>`),
    "</g>",
  ].join("");

  const svg = [
    "<svg>",
    '<text class="stat">&gt; /buddy-onchain</text>',
    '<text class="stat">shiny RARE</text>',
    '<text class="stat">==============</text>',
    frame("f0", ["      .[||].", "     [ -  - ]", "     [ ==== ]"]),
    frame("f1", ["      .[||].", "     [ o  - ]", "     [ ==== ]"]),
    frame("f2", ["      .[||].", "     [ -  o ]", "     [ ==== ]"]),
    frame("fb", ["      .[||].", "     [ ×  × ]", "     [ ==== ]"]),
    '<text class="stat">==============</text>',
    '<text class="stat">HP 42 / ATK 17</text>',
    "</svg>",
  ].join("");
  const svgB64 = Buffer.from(svg, "utf8").toString("base64");
  const jsonB64 = Buffer.from(JSON.stringify({
    image: `data:image/svg+xml;base64,${svgB64}`,
  })).toString("base64");

  return `data:application/json;base64,${jsonB64}`;
}

function sourceSessionStartHarness(mode: "warm" | "cold" | "rpc-fail"): string {
  const tokenUri = JSON.stringify(makeTokenUri());
  const tokenExpr = mode === "warm" ? "42n" : "0n";
  const tokenBranch = mode === "rpc-fail"
    ? 'throw new Error("rpc unavailable");'
    : `return ${tokenExpr};`;

  return `
    import { setPublicClientForTest } from "./src/publicClient.ts";
    const tokenUri = ${tokenUri};
    setPublicClientForTest({
      readContract: async (call) => {
        if (call.functionName === "getTokenIdByIdentity") {
          ${tokenBranch}
        }
        if (call.functionName === "tokenURI") {
          return tokenUri;
        }
        throw new Error("unexpected readContract call");
      },
    });
    process.argv = ["bun", "src/index.ts", "--session-start"];
    await import("./src/index.ts");
  `;
}

function sourceSessionStartWriterThrowHarness(
  errorKind: "buddy-chain" | "integrity",
): string {
  return `
    import { mock } from "bun:test";

    class BuddyChainStateError extends Error {
      constructor(message) {
        super(message);
        this.name = "BuddyChainStateError";
      }
    }

    mock.module("./src/lookup-payload.ts", () => ({
      BuddyChainStateError,
      resolveAndWriteBuddyChainState: async () => {
        if (${JSON.stringify(errorKind)} === "buddy-chain") {
          throw new BuddyChainStateError("invalid accountUuid");
        }
        throw new Error("deployment chainId mismatch");
      },
    }));

    const { runSessionStart } = await import("./src/session-start.ts");
    await runSessionStart();
  `;
}

async function runSourceSessionStart(
  root: string,
  mode: "warm" | "cold" | "rpc-fail",
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", "--eval", sourceSessionStartHarness(mode)], {
    cwd: PLUGIN_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: root,
      CLAUDE_CONFIG_DIR: root,
      BUDDY_NETWORK: "local",
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

async function runSourceSessionStartWithWriterThrow(
  root: string,
  errorKind: "buddy-chain" | "integrity",
): Promise<RunResult> {
  const proc = Bun.spawn(
    ["bun", "--eval", sourceSessionStartWriterThrowHarness(errorKind)],
    {
      cwd: PLUGIN_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: root,
        CLAUDE_CONFIG_DIR: root,
        BUDDY_NETWORK: "local",
      },
    },
  );

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    rmSync(tmpRoots.pop()!, { recursive: true, force: true });
  }
});

describe("SessionStart ruleset selection", () => {
  // Single ruleset for all active mode × all writer chain outcomes.
  // Off gating + persisted-mode routing covered separately below.
  test.each(["warm", "cold", "rpc-fail"] as const)(
    "active mode emits RULESET_AMBIENT regardless of writer state (%s)",
    async (mode) => {
      const root = freshClaudeRoot();

      const result = await runSourceSessionStart(root, mode);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trimEnd()).toBe(RULESET_AMBIENT);
    },
  );

  // Seed non-default `lite` so the assertion fails if writer clobbers
  // persisted mode with the default `full`.
  test("warm writer preserves persisted lite preference in state file", async () => {
    const root = freshClaudeRoot();
    seedState(root, LOCAL_IDENTITY, "unknown", "lite");

    const result = await runSourceSessionStart(root, "warm");
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(state.mode).toBe("lite");
  });

  // Forces the writer-success path so we test post-resolve mode routing
  // (`rulesetForMode("off") → "OK"`), not the env-off short-circuit at
  // `runSessionStart`'s top. Exact-stdout `"OK\n"` proves no ruleset and
  // no statusline nudge appended.
  test("persisted off post-resolve emits OK (no ruleset, no nudge)", async () => {
    const root = freshClaudeRoot();
    seedState(root, LOCAL_IDENTITY, "warm", "off");

    const result = await runSourceSessionStart(root, "warm");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(result.stderr).toBe("");
  });
});

describe("SessionStart environment override", () => {
  test("BUDDY_MODE=off emits OK before config, state, or RPC work", async () => {
    const root = freshClaudeRoot();
    writeFileSync(join(root, ".claude.json"), "{ not valid json");
    rmSync(statePath(root), { force: true });

    const result = await runSessionStart(root, { BUDDY_MODE: "off" });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK\n");
    expect(() => readFileSync(statePath(root), "utf8")).toThrow();
  });
});

describe("SessionStart chain writer behavior", () => {
  test("warm SessionStart writes warm state without refreshing art cache", async () => {
    const root = freshClaudeRoot();

    const result = await runSourceSessionStart(root, "warm");
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(state).toMatchObject({
      ...LOCAL_IDENTITY,
      hatch: "warm",
      tokenId: "0x2a",
    });
    expect(readArtCacheFile(root)).toBeNull();
  });

  test.each([
    ["cold", "cold"],
    ["unknown", "rpc-fail"],
  ] as const)("%s SessionStart does not populate art cache", async (_name, mode) => {
    const root = freshClaudeRoot();

    const result = await runSourceSessionStart(root, mode);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(readArtCacheFile(root)).toBeNull();
  });

  test("SessionStart RPC fail force-demotes cached warm state to unknown", async () => {
    const root = freshClaudeRoot();
    seedState(root, LOCAL_IDENTITY, "warm", "full");

    const result = await runSourceSessionStart(root, "rpc-fail");
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(state.hatch).toBe("unknown");
    expect(state.tokenId).toBeNull();
    expect(state.accountUuidHash).toBe(LOCAL_IDENTITY.accountUuidHash);
    expect(state.chainId).toBe(LOCAL_IDENTITY.chainId);
    expect(state.contractAddress).toBe(LOCAL_IDENTITY.contractAddress);
  });
});

describe("SessionStart statusline nudge", () => {
  test.each([
    ["missing settings file", undefined, true],
    ["settings without statusLine", {}, true],
    ["statusLine null", { statusLine: null }, false],
    ["statusLine populated", { statusLine: { type: "command", command: "x" } }, false],
  ] as const)("nudge behavior: %s", async (_name, settings, shouldNudge) => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "unknown", "full");

    if (settings === undefined) {
      rmSync(join(root, "settings.json"), { force: true });
    } else {
      writeSettings(root, settings);
    }

    const result = await runSessionStart(root);
    const hasNudge = result.stdout.includes("STATUSLINE SETUP NEEDED");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(hasNudge).toBe(shouldNudge);

    if (shouldNudge) {
      expect(result.stdout).toContain("buddy-statusline.sh");
      expect(result.stdout).toContain("statusLine");
      expect(result.stdout).toContain("bash");
    }
  });
});

describe("SessionStart drift recovery flag cleanup", () => {
  test("clears stale drift flag on boot", async () => {
    const root = freshClaudeRoot();
    seedDriftFlag(root);

    const result = await runSourceSessionStart(root, "warm");

    expect(result.exitCode).toBe(0);
    expect(existsSync(driftFlagPath(root))).toBe(false);
    expect(existsSync(expectedRenderFlagPath(root))).toBe(false);
  });

  test("clears stale expected-render flag on boot", async () => {
    const root = freshClaudeRoot();
    seedExpectedRenderFlag(root);

    const result = await runSourceSessionStart(root, "warm");

    expect(result.exitCode).toBe(0);
    expect(existsSync(driftFlagPath(root))).toBe(false);
    expect(existsSync(expectedRenderFlagPath(root))).toBe(false);
  });

  test("clears both stale flags on boot", async () => {
    const root = freshClaudeRoot();
    seedDriftFlag(root);
    seedExpectedRenderFlag(root);

    const result = await runSourceSessionStart(root, "warm");

    expect(result.exitCode).toBe(0);
    expect(existsSync(driftFlagPath(root))).toBe(false);
    expect(existsSync(expectedRenderFlagPath(root))).toBe(false);
  });

  test("boot with neither flag set does not create flags", async () => {
    const root = freshClaudeRoot();

    const result = await runSourceSessionStart(root, "warm");

    expect(result.exitCode).toBe(0);
    expect(existsSync(driftFlagPath(root))).toBe(false);
    expect(existsSync(expectedRenderFlagPath(root))).toBe(false);
  });
});

describe("SessionStart soft-fail discipline", () => {
  test("malformed claude config emits OK, exits 0, and does not clobber state", async () => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "warm", "full");
    const before = readFileSync(statePath(root), "utf8");
    writeFileSync(join(root, ".claude.json"), "{ not valid json");

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(result.stderr).toBe("");
    expect(readFileSync(statePath(root), "utf8")).toBe(before);
  });

  test("invalid UUID emits OK and does not clobber state", async () => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "warm", "full");
    const before = readFileSync(statePath(root), "utf8");
    writeClaudeConfig(root, "not-a-uuid");

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(result.stderr).toBe("");
    expect(readFileSync(statePath(root), "utf8")).toBe(before);
  });

  test("missing Claude identity falls back to anon, emits OK, and does not clobber state", async () => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "warm", "full");
    const before = readFileSync(statePath(root), "utf8");
    writeFileSync(join(root, ".claude.json"), JSON.stringify({}));

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(result.stderr).toBe("");
    expect(readFileSync(statePath(root), "utf8")).toBe(before);
  });

  test.each(["buddy-chain", "integrity"] as const)(
    "writer throw (%s) emits ambient ruleset with statusline nudge",
    async (errorMode) => {
      const root = freshClaudeRoot();
      rmSync(join(root, "settings.json"), { force: true });

      const result = await runSourceSessionStartWithWriterThrow(root, errorMode);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(RULESET_AMBIENT);
      expect(result.stdout).toContain("STATUSLINE SETUP NEEDED");
    },
  );

  test("writer throw does not clobber persisted mode", async () => {
    const root = freshClaudeRoot();
    seedState(root, LOCAL_IDENTITY, "warm", "lite");

    const result = await runSourceSessionStartWithWriterThrow(root, "integrity");
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(state.mode).toBe("lite");
  });

  // Persisted `off` + writer throw must route through the fallback's
  // `readState()?.mode` step. A regression that hardcoded the fallback
  // to `defaultState().mode` (`full`) would emit RULESET_AMBIENT instead
  // of `OK` and this test would fail.
  test("writer throw with persisted off emits OK (fallback honors persisted)", async () => {
    const root = freshClaudeRoot();
    seedState(root, LOCAL_IDENTITY, "warm", "off");

    const result = await runSourceSessionStartWithWriterThrow(root, "integrity");

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("OK\n");
  });
});

describe("SessionStart identity invalidation", () => {
  test("BUDDY_NETWORK=sepolia invalidates mainnet-cached warmth", async () => {
    const root = freshClaudeRoot();
    const deploymentsDir = freshDeploymentsDir();
    seedState(root, MAINNET_IDENTITY, "warm", "full");

    const result = await runSessionStart(root, {
      BUDDY_NETWORK: "sepolia",
      BUDDY_TEST_DEPLOYMENTS_DIR: deploymentsDir,
    });
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(state.hatch).toBe("unknown");
    expect(state.tokenId).toBeNull();
    expect(state.chainId).toBe(84532);
  });
});

describe("index --session-start flag", () => {
  test("--session-start conflicts with UserPromptSubmit hook flags", async () => {
    const root = freshClaudeRoot();
    const result = await runSessionStart(root, {}, ["--hook"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("mutually exclusive");
  });
});

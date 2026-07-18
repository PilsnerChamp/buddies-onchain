// SessionStart hook tests exercise the bundled `dist/index.js` for CLI flag
// behavior and source-level subprocess harnesses for chain-state branches.
// Source harnesses install the publicClient test seam before importing the
// SessionStart entry, keeping mode/state cases hermetic.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { RULESET_AMBIENT } from "../src/instructions";
import type { BuddyStateV4, HatchState, IdentityTuple, ModeLevel } from "../src/buddy-state";

const TEST_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
const PLUGIN_ROOT = join(import.meta.dir, "..");
const DIST = join(PLUGIN_ROOT, "dist", "index.js");

// Pre-deploy mainnet identity (null contract) — used where a subprocess reads
// an empty deployments dir.
const MAINNET_IDENTITY: IdentityTuple = {
  accountUuidHash: createHash("sha256").update(TEST_UUID).digest("hex"),
  chainId: 8453,
  contractAddress: null,
};

// Fully-resolved mainnet identity: chainId 8453 + the deployed BuddyNFT address
// from `plugin/deployments/8453.json`. Subprocesses that read the real
// deployments dir resolve this via `getActiveNetwork()`.
const MAINNET_DEPLOYED_IDENTITY: IdentityTuple = {
  accountUuidHash: createHash("sha256").update(TEST_UUID).digest("hex"),
  chainId: 8453,
  contractAddress: "0x5684082f1219ecb61cbd2e8ec2df537104a48fc9",
};

// A stale testnet-era identity persisted from staging. The mainnet-only plugin
// must invalidate it on the next resolve.
const STALE_TESTNET_IDENTITY: IdentityTuple = {
  accountUuidHash: createHash("sha256").update(TEST_UUID).digest("hex"),
  chainId: 84532,
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
  // Seeded global heartbeat = badge has rendered somewhere → no statusline
  // nudge. Nudge tests delete it explicitly.
  writeHeartbeatFile(globalHeartbeatPath(root));

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

function globalHeartbeatPath(root: string): string {
  return join(root, "plugins", "buddy-onchain", ".badge-heartbeat");
}

function projectHeartbeatPath(root: string, projectDir: string): string {
  const key = createHash("sha256").update(projectDir).digest("hex").slice(0, 16);
  return join(root, "plugins", "buddy-onchain", "projects", key, ".badge-heartbeat");
}

function writeHeartbeatFile(path: string, mtime?: Date): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
  if (mtime !== undefined) {
    utimesSync(path, mtime, mtime);
  }
}

function staleDate(): Date {
  // An "overnight gap" mtime — old enough that any freshness-window
  // regression would misread it as unwired.
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
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

function sessionFreshFlagPath(root: string): string {
  return join(root, "plugins", "buddy-onchain", "session-fresh.flag");
}

function seedDriftFlag(root: string): void {
  writeFileSync(driftFlagPath(root), "");
}

function seedExpectedRenderFlag(root: string): void {
  writeFileSync(expectedRenderFlagPath(root), "");
}

function seedSessionFreshFlag(root: string): void {
  writeFileSync(sessionFreshFlagPath(root), "");
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
      // Pin the project dir so heartbeat-based nudge checks are hermetic —
      // the test runner's own CLAUDE_PROJECT_DIR must not leak in.
      CLAUDE_PROJECT_DIR: root,
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
      ensureWarmArtCache: async () => {},
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
      CLAUDE_PROJECT_DIR: root,
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
        CLAUDE_PROJECT_DIR: root,
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

describe("SessionStart session-fresh flag", () => {
  test("sets session-fresh when emitting ambient ruleset", async () => {
    const root = freshClaudeRoot();

    const result = await runSourceSessionStart(root, "warm");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(existsSync(sessionFreshFlagPath(root))).toBe(true);
  });

  test("does not set session-fresh when resolved mode is off", async () => {
    const root = freshClaudeRoot();
    seedState(root, LOCAL_IDENTITY, "warm", "off");

    const result = await runSourceSessionStart(root, "warm");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(existsSync(sessionFreshFlagPath(root))).toBe(false);
  });

  test("clears stale session-fresh on env-off boot", async () => {
    const root = freshClaudeRoot();
    seedSessionFreshFlag(root);

    const result = await runSessionStart(root, { BUDDY_MODE: "off" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(existsSync(sessionFreshFlagPath(root))).toBe(false);
  });
});

describe("SessionStart chain writer behavior", () => {
  test("warm SessionStart writes warm state and rebuilds the missing art cache", async () => {
    const root = freshClaudeRoot();

    const result = await runSourceSessionStart(root, "warm");
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(state).toMatchObject({
      ...MAINNET_DEPLOYED_IDENTITY,
      hatch: "warm",
      tokenId: "0x2a",
    });
    expect(readArtCacheFile(root)).toMatchObject({
      schemaVersion: 1,
      accountUuidHash: MAINNET_DEPLOYED_IDENTITY.accountUuidHash,
      chainId: MAINNET_DEPLOYED_IDENTITY.chainId,
      contractAddress: MAINNET_DEPLOYED_IDENTITY.contractAddress,
      tokenId: "0x2a",
    });
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
    // Same (mainnet) identity as the subprocess resolves, so this exercises the
    // force-demote (warm → unknown on session-start RPC fail), not an identity
    // rotation.
    seedState(root, MAINNET_DEPLOYED_IDENTITY, "warm", "full");

    const result = await runSourceSessionStart(root, "rpc-fail");
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(state.hatch).toBe("unknown");
    expect(state.tokenId).toBeNull();
    expect(state.accountUuidHash).toBe(MAINNET_DEPLOYED_IDENTITY.accountUuidHash);
    expect(state.chainId).toBe(MAINNET_DEPLOYED_IDENTITY.chainId);
    expect(state.contractAddress).toBe(MAINNET_DEPLOYED_IDENTITY.contractAddress);
  });
});

describe("SessionStart statusline script install", () => {
  test("boot refreshes version-stable script copies in the data dir", async () => {
    const root = freshClaudeRoot();

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(root, "plugins", "buddy-onchain", "buddy-statusline.sh"))).toBe(true);
    expect(existsSync(join(root, "plugins", "buddy-onchain", "buddy-statusline.ps1"))).toBe(true);
  });

  test("env-off boot still refreshes the script copies", async () => {
    // A wired badge renders the `off` state too — plugin updates must reach
    // the data-dir copy even when the buddy itself is muted.
    const root = freshClaudeRoot();

    const result = await runSessionStart(root, { BUDDY_MODE: "off" });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("OK\n");
    expect(existsSync(join(root, "plugins", "buddy-onchain", "buddy-statusline.sh"))).toBe(true);
  });
});

describe("SessionStart statusline nudge (badge heartbeat)", () => {
  // The project dir the subprocess resolves is CLAUDE_PROJECT_DIR = root
  // (pinned in the runners), so project-heartbeat cases key off `root`.
  test("no heartbeat at all nudges", async () => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "unknown", "full");
    rmSync(globalHeartbeatPath(root), { force: true });

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(result.stdout).toContain("STATUSLINE SETUP NEEDED");
    expect(result.stdout).toContain("buddy-statusline.sh");
    expect(result.stdout).toContain("statusLine");
    expect(result.stdout).toContain("bash");
  });

  test("old heartbeat mtimes still suppress — idle gap is not unwired", async () => {
    // Statusline renders are event-driven: an overnight gap leaves old
    // mtimes everywhere on a perfectly wired setup. Existence must win.
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "unknown", "full");
    writeHeartbeatFile(globalHeartbeatPath(root), staleDate());
    writeHeartbeatFile(projectHeartbeatPath(root, root), staleDate());

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(result.stdout).not.toContain("STATUSLINE SETUP NEEDED");
  });

  test("global heartbeat suppresses the nudge (badge rendered somewhere)", async () => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "unknown", "full");

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(result.stdout).not.toContain("STATUSLINE SETUP NEEDED");
  });

  test("project heartbeat suppresses the nudge without a global one", async () => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "unknown", "full");
    rmSync(globalHeartbeatPath(root), { force: true });
    writeHeartbeatFile(projectHeartbeatPath(root, root));

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(result.stdout).not.toContain("STATUSLINE SETUP NEEDED");
  });

  test("another project's heartbeat alone does not suppress the nudge", async () => {
    const root = freshClaudeRoot();
    seedState(root, MAINNET_IDENTITY, "unknown", "full");
    rmSync(globalHeartbeatPath(root), { force: true });
    writeHeartbeatFile(projectHeartbeatPath(root, "/some/other/project"));

    const result = await runSessionStart(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(result.stdout).toContain("STATUSLINE SETUP NEEDED");
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

  test("boot with neither recovery flag set does not create recovery flags", async () => {
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
      rmSync(globalHeartbeatPath(root), { force: true });

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
  test("stale testnet-cached warmth is invalidated against mainnet", async () => {
    // The mainnet-only plugin resolves chainId 8453; a persisted testnet-era
    // identity (84532) mismatches and must be reset to unknown, adopting the
    // live mainnet identity.
    const root = freshClaudeRoot();
    // Empty deployments dir => pre-deploy read (buddyNft null), so no live RPC
    // is attempted; the assertion isolates identity invalidation.
    const deploymentsDir = freshDeploymentsDir();
    seedState(root, STALE_TESTNET_IDENTITY, "warm", "full");

    const result = await runSessionStart(root, {
      BUDDY_TEST_DEPLOYMENTS_DIR: deploymentsDir,
    });
    const state = JSON.parse(readFileSync(statePath(root), "utf8")) as BuddyStateV4;

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(RULESET_AMBIENT);
    expect(state.hatch).toBe("unknown");
    expect(state.tokenId).toBeNull();
    expect(state.chainId).toBe(8453);
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

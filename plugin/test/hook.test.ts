/**
 * End-to-end tests for the UserPromptSubmit hook.
 *
 * The hook is exercised in a subprocess so routing, stdout JSON shape,
 * state writes, and cadence side effects match the plugin entrypoint.
 * Chain reads use a tiny in-process harness that installs the publicClient
 * test seam before importing `src/index.ts`.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { RULESET_AMBIENT } from "../src/instructions";
import { mutateState } from "../src/buddy-state";
import {
  COLD_NUDGE_LINE_1,
  COLD_NUDGE_LINE_2,
} from "../src/sprite-decorations";

const TEST_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
const PLUGIN_ROOT = join(import.meta.dir, "..");
const DIST = join(PLUGIN_ROOT, "dist", "index.js");
const RULESET_PREFIX = "BUDDIES ONCHAIN AMBIENT ACTIVE.";
const HATCH_FRAGMENT =
  "identityHash=0x0fa54136bda4ecc31bcd4169c89d1ea7d5f294d7ef27022c1f68cfd5bab4ddbb&prngSeed=2990586173";
const LOCAL_HATCH_URL = `http://localhost:5173/hatch#${HATCH_FRAGMENT}`;
const PROD_HATCH_URL = `https://buddies-onchain.xyz/hatch#${HATCH_FRAGMENT}`;

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

type HookMockMode = "warm" | "cold" | "throw" | "warm-token-uri-throw";

const tmpDirs: string[] = [];

function freshClaudeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "buddy-hook-"));
  tmpDirs.push(dir);

  mkdirSync(join(dir, "plugins", "buddy-onchain"), { recursive: true });
  writeFileSync(
    join(dir, ".claude.json"),
    JSON.stringify({ oauthAccount: { accountUuid: TEST_UUID } }),
  );

  return dir;
}

function statePath(claudeDir: string): string {
  return join(claudeDir, "plugins", "buddy-onchain", ".buddy-state");
}

function frameStatePath(claudeDir: string, projectDir: string): string {
  const projectKey = createHash("sha256").update(projectDir).digest("hex").slice(0, 16);
  return join(
    claudeDir,
    "plugins",
    "buddy-onchain",
    "projects",
    projectKey,
    TEST_UUID,
    "31337",
    "state.json",
  );
}

function artCachePath(claudeDir: string): string {
  return join(claudeDir, "plugins", "buddy-onchain", ".buddy-art-cache.json");
}

function driftFlagPath(claudeDir: string): string {
  return join(claudeDir, "plugins", "buddy-onchain", "repeat-buddy-instructions.flag");
}

function expectedRenderFlagPath(claudeDir: string): string {
  return join(claudeDir, "plugins", "buddy-onchain", "expected-render.flag");
}

function seedDriftFlag(claudeDir: string): void {
  writeFileSync(driftFlagPath(claudeDir), "");
}

function seedExpectedRenderFlag(claudeDir: string): void {
  writeFileSync(expectedRenderFlagPath(claudeDir), "");
}

function identityLocal() {
  return {
    accountUuidHash: createHash("sha256").update(TEST_UUID).digest("hex"),
    chainId: 31337,
    contractAddress: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
  };
}

function seedBuddyState(
  claudeDir: string,
  patch: Record<string, unknown>,
): void {
  writeFileSync(
    statePath(claudeDir),
    JSON.stringify({
      schemaVersion: 4,
      mode: "full",
      hatch: "warm",
      tokenId: "0x2a",
      turnCounter: 0,
      coldNudgeCounter: 0,
      ...identityLocal(),
      ...patch,
    }),
  );
}

function seedArtCache(claudeDir: string, patch: Record<string, unknown> = {}): void {
  const cache = {
    schemaVersion: 1,
    ...identityLocal(),
    tokenId: "0x2a",
    frames: {
      f0: ["      .[||].", "     [ -  - ]", "     [ ==== ]"],
      f1: ["      .[||].", "     [ o  - ]", "     [ ==== ]"],
      f2: ["      .[||].", "     [ -  o ]", "     [ ==== ]"],
      fb: ["      .[||].", "     [ ×  × ]", "     [ ==== ]"],
    },
    cachedAtMs: 12345,
    ...patch,
  };

  mkdirSync(dirname(artCachePath(claudeDir)), { recursive: true });
  writeFileSync(artCachePath(claudeDir), JSON.stringify(cache));
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

function mockHarness(mode: HookMockMode): string {
  const tokenUri = JSON.stringify(makeTokenUri());
  const tokenExpr = mode === "warm" || mode === "warm-token-uri-throw" ? "42n" : "0n";
  const tokenBranch = mode === "throw"
    ? 'throw new Error("rpc unavailable");'
    : `return ${tokenExpr};`;
  const tokenUriBranch = mode === "warm-token-uri-throw"
    ? 'throw new Error("tokenURI unavailable");'
    : "return tokenUri;";

  return `
    import { setPublicClientForTest } from "./src/publicClient.ts";
    const tokenUri = ${tokenUri};
    let readContractCount = 0;
    setPublicClientForTest({
      readContract: async (call) => {
        readContractCount++;
        if (call.functionName === "getTokenIdByIdentity") {
          ${tokenBranch}
        }
        if (call.functionName === "tokenURI") {
          ${tokenUriBranch}
        }
        throw new Error("unexpected readContract call");
      },
    });
    process.argv = ["bun", "src/index.ts", "--hook"];
    await import("./src/index.ts");
    if (process.env.BUDDY_HOOK_REPORT_READS === "1") {
      console.error(\`READ_CONTRACT_COUNT=\${readContractCount}\`);
    }
  `;
}

async function runHook(
  promptPayload: object | string,
  claudeDir: string,
  mode: HookMockMode = "throw",
  env: Record<string, string> = {},
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", "--eval", mockHarness(mode)], {
    cwd: PLUGIN_ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: claudeDir,
      CLAUDE_CONFIG_DIR: claudeDir,
      BUDDY_NETWORK: "local",
      ...env,
    },
  });
  const payload = typeof promptPayload === "string"
    ? promptPayload
    : JSON.stringify(promptPayload);
  proc.stdin.write(payload);
  await proc.stdin.end();

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

async function runDistHook(
  promptPayload: object | string,
  claudeDir: string,
  flag = "--hook",
  env: Record<string, string> = {},
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", DIST, flag], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: claudeDir,
      CLAUDE_CONFIG_DIR: claudeDir,
      BUDDY_NETWORK: "mainnet",
      ...env,
    },
  });
  const payload = typeof promptPayload === "string"
    ? promptPayload
    : JSON.stringify(promptPayload);
  proc.stdin.write(payload);
  await proc.stdin.end();

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

async function runSourceCli(
  args: string[],
  claudeDir: string,
  stdinPayload: object | string | null = null,
  env: Record<string, string> = {},
): Promise<RunResult> {
  const script = `
    process.argv = ${JSON.stringify(["bun", "src/index.ts", ...args])};
    await import("./src/index.ts");
  `;
  const proc = Bun.spawn(["bun", "--eval", script], {
    cwd: PLUGIN_ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: claudeDir,
      CLAUDE_CONFIG_DIR: claudeDir,
      BUDDY_NETWORK: "local",
      ...env,
    },
  });
  const payload = stdinPayload === null
    ? ""
    : typeof stdinPayload === "string"
      ? stdinPayload
      : JSON.stringify(stdinPayload);
  proc.stdin.write(payload);
  await proc.stdin.end();

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

function additionalContext(stdout: string): string {
  const parsed = JSON.parse(stdout);
  return parsed.hookSpecificOutput.additionalContext;
}

function mutationContext(verb: string): string {
  return [
    "BUDDY_RENDER_BEGIN",
    `mode updated: \`${verb}\``,
    "BUDDY_RENDER_END",
  ].join("\n");
}

function readContractCount(stderr: string): number {
  const match = stderr.match(/READ_CONTRACT_COUNT=(\d+)/);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

// Asserted sprite rows correspond to the robot sleeping frame for TEST_UUID
// (body-preserving trait seed → species "robot", hat "none"). If TEST_UUID changes species, these
// row assertions must change with it.
function expectSleepingAmbient(stdout: string): void {
  const context = additionalContext(stdout);

  expect(context).toContain("DISPLAY_BUDDY");
  expect(context).toContain("```");
  // Ambient block dedents the common left margin and adds one space of left
  // padding (matching the ` | ` joke separator), so sprite rows render flush
  // with one leading space rather than the on-chain centering padding.
  expect(context).toContain("  .[||].  | ");
  expect(context).toContain(" [ -  - ] | ");
  expect(context).toContain(" [ ==== ] | ");
  expect(context).toContain(" `------´ | ");
  expect(context).not.toContain("BUDDY_RENDER_BEGIN");
  expect(context).toContain(" | ");
}

function fencedBodyRows(context: string): string[] {
  const lines = context.split(/\r?\n/);
  const open = lines.findIndex((line) => line.trim() === "```");
  expect(open).toBeGreaterThanOrEqual(0);

  const close = lines.findIndex((line, idx) => idx > open && line.trim() === "```");
  expect(close).toBeGreaterThan(open);

  return lines.slice(open + 1, close);
}

function approximateTokens(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("hook — lookup route", () => {
  test("bare warm lookup emits card, decision message, view URL, and mode/change lines", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "warm");
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(context).toContain("BUDDY_RENDER_BEGIN");
    expect(context).toContain("go see your buddy onchain:");
    expect(context).toContain(`http://localhost:5173/view/42`);
    expect(context).toContain("your buddy appears on every user prompt (mode: `full`).");
    expect(context).toContain("change: `/buddy-onchain lite|full|off`");
    expect(JSON.parse(readFileSync(statePath(claudeDir), "utf8")).turnCounter).toBe(1);
  });

  test("bare cold lookup emits hatch guidance", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "cold");
    const context = additionalContext(result.stdout);

    expect(context).toContain(LOCAL_HATCH_URL);
    expect(context).not.toContain(TEST_UUID);
    expect(context).toMatch(
      /http:\/\/localhost:5173\/hatch#identityHash=0x[0-9a-f]{64}&prngSeed=\d+/,
    );
    expect(context).toContain("your buddy is sleeping - hatch it onchain:");
    expect(context).toContain("your buddy appears on every user prompt (mode: `full`).");
    expect(context).toContain("change: `/buddy-onchain lite|full|off`");
  });

  test("bare cold lookup decorates slash card with sleep indicator", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "cold");
    const context = additionalContext(result.stdout);
    const bodyRows = fencedBodyRows(context);

    expect(result.exitCode).toBe(0);
    expect(context).toContain("BUDDY_RENDER_BEGIN");
    expect(context).toContain("your buddy is sleeping - hatch it onchain:");
    expect(context).toContain(LOCAL_HATCH_URL);
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows[0]).toContain("ZZzzz...");
  });

  test("bare unknown lookup emits retry guidance", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "throw");
    const context = additionalContext(result.stdout);

    expect(context).toContain("unable to verify onchain status - try online:");
    expect(context).toContain(LOCAL_HATCH_URL);
    expect(context).toContain("your buddy appears on every user prompt (mode: `full`).");
    expect(context).toContain("change: `/buddy-onchain lite|full|off`");
  });

  test("bare unknown lookup keeps slash card undecorated", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "throw");
    const context = additionalContext(result.stdout);
    const bodyRows = fencedBodyRows(context);

    expect(result.exitCode).toBe(0);
    expect(context).toContain("unable to verify onchain status - try online:");
    expect(context).not.toContain("ZZzzz...");
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows[0]).toBe("");
    expect(bodyRows[1]).toContain(".[||].");
  });

  test("cached warm + RPC throw emits warm decision and view URL", async () => {
    // Regression for the v0.4.0 honesty bug: cached warm + anvil down used
    // to render live-warm copy with a /hatch URL.
    // Now the warm decision keeps view URL through transient chain failure.
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "warm",
      tokenId: "0x2a",
      mode: "lite",
    });
    seedArtCache(claudeDir);

    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "throw");
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context).toContain("go see your buddy onchain:");
    expect(context).toContain(`http://localhost:5173/view/42`);
    expect(context).not.toContain("/hatch#");
    expect(context).toContain("your buddy appears every 3rd prompt (mode: `lite`).");
    expect(context).toContain("change: `/buddy-onchain lite|full|off`");
    expect(context).toContain("      .[||].");
  });

  test("warm lookup with tokenURI failure falls back undecorated while state stays warm", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook(
      { prompt: "/buddy-onchain" },
      claudeDir,
      "warm-token-uri-throw",
    );
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));
    const bodyRows = fencedBodyRows(context);

    expect(result.exitCode).toBe(0);
    expect(state.hatch).toBe("warm");
    expect(context).toContain("go see your buddy onchain:");
    expect(context).toContain(`http://localhost:5173/view/42`);
    expect(context).not.toContain("ZZzzz...");
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows[0]).toBe("");
  });

  test("cached cold plus RPC throw keeps slash card sleep indicator", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "cold",
      tokenId: null,
    });

    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "throw");
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));
    const bodyRows = fencedBodyRows(context);

    expect(result.exitCode).toBe(0);
    expect(state.hatch).toBe("cold");
    expect(context).toContain("your buddy is sleeping - hatch it onchain:");
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows[0]).toContain("ZZzzz...");
  });

  test("cold slash card keeps sleep indicator under BUDDY_MODE off", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook(
      { prompt: "/buddy-onchain" },
      claudeDir,
      "cold",
      { BUDDY_MODE: "off" },
    );
    const context = additionalContext(result.stdout);
    const bodyRows = fencedBodyRows(context);

    expect(result.exitCode).toBe(0);
    expect(context).toContain("BUDDY_RENDER_BEGIN");
    expect(context).toContain("your buddy is sleeping - hatch it onchain:");
    expect(context).toContain("your buddy is silent on prompts (mode: `off`).");
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows[0]).toContain("ZZzzz...");
  });
});

describe("hook — mutate route", () => {
  test("warm mutation writes preference locally without chain access", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook(
      { prompt: "/buddy-onchain lite" },
      claudeDir,
      "throw",
      { BUDDY_HOOK_REPORT_READS: "1" },
    );
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).toBe(mutationContext("lite"));
    expect(readContractCount(result.stderr)).toBe(0);
    expect(state.mode).toBe("lite");
    expect(state.turnCounter).toBe(1);
  });

  test("cold mutation writes preference locally without chain access", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "cold",
      tokenId: null,
      mode: "full",
    });

    const result = await runHook(
      { prompt: "/buddy-onchain off" },
      claudeDir,
      "throw",
      { BUDDY_HOOK_REPORT_READS: "1" },
    );
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).toBe(mutationContext("off"));
    expect(readContractCount(result.stderr)).toBe(0);
    expect(approximateTokens(context)).toBeLessThanOrEqual(100);
    expect(state.hatch).toBe("cold");
    expect(state.mode).toBe("off");
  });

  test("unknown mutation writes preference locally without chain access", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "unknown",
      tokenId: null,
      mode: "full",
    });

    const result = await runHook(
      { prompt: "/buddy-onchain lite" },
      claudeDir,
      "throw",
      { BUDDY_HOOK_REPORT_READS: "1" },
    );
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).toBe(mutationContext("lite"));
    expect(readContractCount(result.stderr)).toBe(0);
    expect(approximateTokens(context)).toBeLessThanOrEqual(100);
    expect(state.hatch).toBe("unknown");
    expect(state.mode).toBe("lite");
  });

  test("invalid verb emits merged command help", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runHook({ prompt: "/buddy-onchain ultra" }, claudeDir);
    const context = additionalContext(result.stdout);

    expect(context).toBe([
      "BUDDY_RENDER_BEGIN",
      "unknown verb `ultra`. Use: `off` | `lite` | `full`",
      "BUDDY_RENDER_END",
    ].join("\n"));
  });

  test("cached warm + RPC outage mutates locally without rendering lookup copy", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "warm",
      tokenId: "0x2a",
      mode: "full",
    });
    seedArtCache(claudeDir);

    const result = await runHook(
      { prompt: "/buddy-onchain lite" },
      claudeDir,
      "throw",
      { BUDDY_HOOK_REPORT_READS: "1" },
    );
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).toBe(mutationContext("lite"));
    expect(readContractCount(result.stderr)).toBe(0);
    expect(context).not.toContain("unable to verify buddy onchain");
    expect(context).not.toContain("found your buddy onchain");
    expect(context).not.toContain("/hatch#");
    expect(state.mode).toBe("lite");
    expect(state.hatch).toBe("warm");
    expect(state.tokenId).toBe("0x2a");
  });
});

describe("hook — ambient route", () => {
  test("cold and unknown sleeping ambient respects off-gating and identity match", async () => {
    for (const hatch of ["cold", "unknown"] as const) {
      const claudeDir = freshClaudeDir();
      seedBuddyState(claudeDir, {
        mode: "off",
        hatch,
        tokenId: null,
        turnCounter: 0,
      });

      const result = await runHook({ prompt: "hello buddy" }, claudeDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("{}");
    }

    {
      const claudeDir = freshClaudeDir();
      seedBuddyState(claudeDir, {
        mode: "full",
        hatch: "cold",
        tokenId: null,
        turnCounter: 0,
      });

      const result = await runHook({ prompt: "hello cold buddy" }, claudeDir);
      const context = additionalContext(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(context).toContain("DISPLAY_BUDDY");
      expect(context).toContain("ZZzzz...");
      expect(context).not.toContain("BUDDY_RENDER_BEGIN");
    }

    {
      const claudeDir = freshClaudeDir();
      seedBuddyState(claudeDir, {
        mode: "lite",
        hatch: "unknown",
        tokenId: null,
        turnCounter: 0,
      });

      const result = await runHook({ prompt: "hello unknown buddy" }, claudeDir);

      expect(result.exitCode).toBe(0);
      expectSleepingAmbient(result.stdout);
    }

    {
      const claudeDir = freshClaudeDir();
      seedBuddyState(claudeDir, {
        mode: "full",
        hatch: "unknown",
        tokenId: null,
        turnCounter: 0,
        accountUuidHash: createHash("sha256").update("other-account").digest("hex"),
      });

      const result = await runHook({ prompt: "hello mismatched buddy" }, claudeDir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("{}");
    }
  });

  test("ambient cold identity match decorates sleeping sprite and sets expected-render", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "cold",
      tokenId: null,
      turnCounter: 0,
    });

    const result = await runHook({ prompt: "hello confirmed cold buddy" }, claudeDir);
    const context = additionalContext(result.stdout);
    const pipeRows = fencedBodyRows(context).filter((line) => line.includes("|"));

    expect(result.exitCode).toBe(0);
    expect(context).toContain("DISPLAY_BUDDY");
    expect(context).toContain("ZZzzz...");
    expect(pipeRows).toHaveLength(5);
    expect(pipeRows[0]).toContain("ZZzzz");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(true);
  });

  test("ambient unknown keeps sleeping sprite undecorated", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "unknown",
      tokenId: null,
      turnCounter: 0,
    });

    const result = await runHook({ prompt: "hello unknown buddy" }, claudeDir);
    const context = additionalContext(result.stdout);
    const pipeRows = fencedBodyRows(context).filter((line) => line.includes("|"));

    expect(result.exitCode).toBe(0);
    expectSleepingAmbient(result.stdout);
    expect(context).not.toContain("ZZzzz...");
    expect(pipeRows).toHaveLength(4);
  });

  test("ambient warm cache hit passes cached art through without sleep indicator", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "warm",
      tokenId: "0x2a",
      turnCounter: 0,
    });
    seedArtCache(claudeDir);

    const result = await runHook(
      { prompt: "hello warm cached buddy" },
      claudeDir,
      "throw",
      { BUDDY_NETWORK: "local" },
    );
    const context = additionalContext(result.stdout);
    const pipeRows = fencedBodyRows(context).filter((line) => line.includes("|"));

    expect(result.exitCode).toBe(0);
    expect(context).toContain("DISPLAY_BUDDY");
    expect(context).not.toContain("ZZzzz...");
    expect(context).toContain("[ -  - ]");
    expect(context).toContain("[ ==== ]");
    expect(pipeRows).toHaveLength(3);
  });

  test("ambient warm cache miss stays silent without arming expected-render", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "warm",
      tokenId: "0x2a",
      turnCounter: 0,
    });

    const result = await runHook(
      { prompt: "hello warm cache miss" },
      claudeDir,
      "throw",
      { BUDDY_NETWORK: "local" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stdout).not.toContain("ZZzzz...");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("ambient cached cold keeps sleep indicator after unknown candidate is absorbed", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "cold",
      tokenId: null,
      turnCounter: 0,
    });

    const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR;
    try {
      process.env.CLAUDE_CONFIG_DIR = claudeDir;
      const merged = mutateState(
        (state) => ({
          ...state,
          hatch: "unknown",
          tokenId: null,
        }),
        { preserveKnownHatchOnUnknown: false },
      );
      expect(merged.hatch).toBe("cold");
    } finally {
      if (originalClaudeDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeDir;
      }
    }

    const persisted = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));
    expect(persisted.hatch).toBe("cold");

    const result = await runHook({ prompt: "hello last-known cold buddy" }, claudeDir);
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context).toContain("ZZzzz...");
  });

  test("ambient cold increments nudge counter without firing on first emit", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "cold",
      tokenId: null,
      turnCounter: 0,
      coldNudgeCounter: 0,
    });

    const result = await runHook({ prompt: "cold emit 1" }, claudeDir);
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).toContain("DISPLAY_BUDDY");
    expect(context).toContain("ZZzzz...");
    expect(context).not.toContain("COLD_NUDGE");
    expect(state.coldNudgeCounter).toBe(1);
  });

  test("ambient cold fires nudge on post-increment counter 10", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "cold",
      tokenId: null,
      turnCounter: 0,
      coldNudgeCounter: 9,
    });

    const result = await runHook({ prompt: "cold emit 10" }, claudeDir);
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).toContain("COLD_NUDGE");
    expect(context).toContain(`| ${COLD_NUDGE_LINE_1}`);
    expect(context).toContain(`| ${COLD_NUDGE_LINE_2}`);
    expect(context).toContain(LOCAL_HATCH_URL);
    expect(context).not.toContain(TEST_UUID);
    expect(state.coldNudgeCounter).toBe(10);
  });

  test("ambient cold does not fire nudge immediately after a fire turn", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "cold",
      tokenId: null,
      turnCounter: 0,
      coldNudgeCounter: 10,
    });

    const result = await runHook({ prompt: "cold emit 11" }, claudeDir);
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).not.toContain("COLD_NUDGE");
    expect(state.coldNudgeCounter).toBe(11);
  });

  test("ambient warm does not increment nudge counter", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "warm",
      tokenId: "0x2a",
      turnCounter: 0,
      coldNudgeCounter: 7,
    });
    seedArtCache(claudeDir);

    const result = await runHook(
      { prompt: "warm no nudge" },
      claudeDir,
      "throw",
      { BUDDY_NETWORK: "local" },
    );
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).not.toContain("COLD_NUDGE");
    expect(state.coldNudgeCounter).toBe(7);
  });

  test("ambient unknown does not increment nudge counter", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      hatch: "unknown",
      tokenId: null,
      turnCounter: 0,
      coldNudgeCounter: 7,
    });

    const result = await runHook({ prompt: "unknown no nudge" }, claudeDir);
    const context = additionalContext(result.stdout);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(context).not.toContain("COLD_NUDGE");
    expect(state.coldNudgeCounter).toBe(7);
  });

  test("ambient cold cadence skip does not increment nudge counter", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "lite",
      hatch: "cold",
      tokenId: null,
      turnCounter: 1,
      coldNudgeCounter: 7,
    });

    const result = await runHook({ prompt: "off-cadence cold" }, claudeDir);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(state.turnCounter).toBe(2);
    expect(state.coldNudgeCounter).toBe(7);
  });

  test("ambient cold fire-turn uses production hatch origin on sepolia", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "cold",
      tokenId: null,
      turnCounter: 0,
      coldNudgeCounter: 9,
      chainId: 84532,
      contractAddress: null,
    });

    const result = await runHook(
      { prompt: "sepolia cold nudge" },
      claudeDir,
      "throw",
      { BUDDY_NETWORK: "sepolia" },
    );
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context).toContain("COLD_NUDGE");
    expect(context).toContain(PROD_HATCH_URL);
    expect(context).not.toContain(TEST_UUID);
  });

  test("counter cadence emits on every turn for full mode", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);
    seedBuddyState(claudeDir, { turnCounter: 0 });
    seedArtCache(claudeDir);

    const env = { CLAUDE_PROJECT_DIR: projectDir };
    const outputs: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = await runDistHook(
        { prompt: `ambient ${i}` },
        claudeDir,
        "--hook",
        { ...env, BUDDY_NETWORK: "local" },
      );
      outputs.push(result.stdout.trim());
    }

    expect(outputs[0]).toContain("DISPLAY_BUDDY");
    expect(outputs[1]).toContain("DISPLAY_BUDDY");
    expect(outputs[2]).toContain("DISPLAY_BUDDY");
    expect(outputs[3]).toContain("DISPLAY_BUDDY");

    const firstContext = additionalContext(outputs[0]);
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));
    const frameState = JSON.parse(readFileSync(frameStatePath(claudeDir, projectDir), "utf8"));

    expect(state.turnCounter).toBe(4);
    expect(frameState.lastFrameIndex).toBe(3);
    expect(firstContext).toContain(" [ ==== ] | ");
    expect(firstContext).not.toContain("`------´");
    expect(approximateTokens(firstContext)).toBeLessThanOrEqual(50);
  });

  test("counter cadence emits every 3rd turn for lite mode", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);
    seedBuddyState(claudeDir, { mode: "lite", turnCounter: 0 });
    seedArtCache(claudeDir);

    const env = { CLAUDE_PROJECT_DIR: projectDir };
    const outputs: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = await runDistHook(
        { prompt: `ambient ${i}` },
        claudeDir,
        "--hook",
        { ...env, BUDDY_NETWORK: "local" },
      );
      outputs.push(result.stdout.trim());
    }

    expect(outputs[0]).toContain("DISPLAY_BUDDY");
    expect(outputs[1]).toBe("{}");
    expect(outputs[2]).toBe("{}");
    expect(outputs[3]).toContain("DISPLAY_BUDDY");

    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));
    const frameState = JSON.parse(readFileSync(frameStatePath(claudeDir, projectDir), "utf8"));
    expect(state.turnCounter).toBe(4);
    expect(frameState.lastFrameIndex).toBe(1);
  });

  test("warm ambient with token but missing art cache emits empty gracefully", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);
    seedBuddyState(claudeDir, { turnCounter: 0 });

    const result = await runDistHook(
      { prompt: "ambient without cache" },
      claudeDir,
      "--hook",
      { CLAUDE_PROJECT_DIR: projectDir, BUDDY_NETWORK: "local" },
    );
    const state = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("{}");
    expect(state.turnCounter).toBe(1);
  });

  test("lite ambient emits joke-column sprite block (same layout as full)", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);
    seedBuddyState(claudeDir, { mode: "lite" });
    seedArtCache(claudeDir);

    const result = await runDistHook(
      { prompt: "ambient lite" },
      claudeDir,
      "--hook",
      { CLAUDE_PROJECT_DIR: projectDir, BUDDY_NETWORK: "local" },
    );
    const context = additionalContext(result.stdout);

    expect(context).toContain("DISPLAY_BUDDY");
    expect(context).toContain(" | ");
  });

  test("slash lookup populates cache for subsequent ambient turns", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);

    const slash = await runHook(
      { prompt: "/buddy-onchain" },
      claudeDir,
      "warm",
      { CLAUDE_PROJECT_DIR: projectDir },
    );
    expect(additionalContext(slash.stdout)).toContain("go see your buddy onchain:");
    expect(() => readFileSync(artCachePath(claudeDir), "utf8")).not.toThrow();

    const env = { CLAUDE_PROJECT_DIR: projectDir, BUDDY_NETWORK: "local" };
    await runDistHook({ prompt: "ambient after slash 1" }, claudeDir, "--hook", env);
    await runDistHook({ prompt: "ambient after slash 2" }, claudeDir, "--hook", env);
    const ambient = await runDistHook(
      { prompt: "ambient after slash 3" },
      claudeDir,
      "--hook",
      env,
    );

    const ambientContext = additionalContext(ambient.stdout);
    expect(ambientContext).toContain("DISPLAY_BUDDY");
    // Lock the cache → ambient render path: the rendered frame must be
    // one of the cached sprite rows (proves ambient read from cache, not
    // from a chain RPC re-fetch).
    expect(ambientContext).toContain("[ ==== ]");
  });

  test("identity rotation via slash clears stale warm cache before next ambient sleeping sprite", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      mode: "full",
      hatch: "warm",
      tokenId: "0xfeed",
      turnCounter: 2,
      chainId: 8453,
      contractAddress: null,
    });
    seedArtCache(claudeDir, {
      chainId: 8453,
      contractAddress: null,
      tokenId: "0xfeed",
    });

    const slash = await runHook(
      { prompt: "/buddy-onchain" },
      claudeDir,
      "throw",
      { BUDDY_NETWORK: "sepolia" },
    );
    const stateAfterSlash = JSON.parse(readFileSync(statePath(claudeDir), "utf8"));

    expect(slash.exitCode).toBe(0);
    expect(stateAfterSlash.hatch).toBe("unknown");
    expect(stateAfterSlash.tokenId).toBeNull();
    expect(stateAfterSlash.chainId).toBe(84532);
    expect(stateAfterSlash.contractAddress).toBeNull();
    expect(() => readFileSync(artCachePath(claudeDir), "utf8")).toThrow();

    const ambient = await runHook(
      { prompt: "ambient after identity rotation" },
      claudeDir,
      "throw",
      { BUDDY_NETWORK: "sepolia" },
    );

    expect(ambient.exitCode).toBe(0);
    expectSleepingAmbient(ambient.stdout);
  });
});

describe("hook — drift reminder lifecycle", () => {
  test("drift flag prepends ruleset to ambient warm sprite, sets expected-render, and clears drift", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);
    seedBuddyState(claudeDir, { turnCounter: 0 });
    seedArtCache(claudeDir);
    seedDriftFlag(claudeDir);

    const result = await runHook(
      { prompt: "ambient with drift reminder" },
      claudeDir,
      "throw",
      { CLAUDE_PROJECT_DIR: projectDir, BUDDY_NETWORK: "local" },
    );
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context.startsWith(RULESET_PREFIX)).toBe(true);
    expect(context).toContain("\n\nDISPLAY_BUDDY [render block top of reply; fill jokes right of |]");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(true);
    expect(existsSync(driftFlagPath(claudeDir))).toBe(false);
  });

  test("drift flag prepends ruleset to lookup slash without setting expected-render", async () => {
    const claudeDir = freshClaudeDir();
    seedDriftFlag(claudeDir);

    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "warm");
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context.startsWith(RULESET_PREFIX)).toBe(true);
    expect(context).toContain("BUDDY_RENDER_BEGIN");
    expect(context).toContain("go see your buddy onchain:");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
    expect(existsSync(driftFlagPath(claudeDir))).toBe(false);
  });

  test("drift flag turns cadence skip into ruleset-only reminder", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, { mode: "lite", turnCounter: 1 });
    seedDriftFlag(claudeDir);

    const result = await runHook({ prompt: "cadence skip with drift" }, claudeDir);
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context).toBe(RULESET_AMBIENT);
    expect(context.startsWith(RULESET_PREFIX)).toBe(true);
    expect(context).not.toContain("BUDDY_RENDER_BEGIN");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
    expect(existsSync(driftFlagPath(claudeDir))).toBe(false);
  });

  test("drift flag turns off mode into ruleset-only reminder", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, { mode: "off" });
    seedDriftFlag(claudeDir);

    const result = await runHook({ prompt: "off mode with drift" }, claudeDir);
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context).toBe(RULESET_AMBIENT);
    expect(context.startsWith(RULESET_PREFIX)).toBe(true);
    expect(context).not.toContain("BUDDY_RENDER_BEGIN");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
    expect(existsSync(driftFlagPath(claudeDir))).toBe(false);
  });

  test("drift flag turns identity mismatch into ruleset-only reminder", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      accountUuidHash: createHash("sha256").update("other-account").digest("hex"),
    });
    seedDriftFlag(claudeDir);

    const result = await runHook({ prompt: "identity mismatch with drift" }, claudeDir);
    const context = additionalContext(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(context).toBe(RULESET_AMBIENT);
    expect(context.startsWith(RULESET_PREFIX)).toBe(true);
    expect(context).not.toContain("BUDDY_RENDER_BEGIN");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
    expect(existsSync(driftFlagPath(claudeDir))).toBe(false);
  });
});

describe("hook — expected-render flag lifecycle", () => {
  test("ambient warm success sets expected-render without drift", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);
    seedBuddyState(claudeDir, { turnCounter: 0 });
    seedArtCache(claudeDir);

    const result = await runHook(
      { prompt: "ambient sets expected-render" },
      claudeDir,
      "throw",
      { CLAUDE_PROJECT_DIR: projectDir, BUDDY_NETWORK: "local" },
    );

    expect(result.exitCode).toBe(0);
    expect(additionalContext(result.stdout)).toContain("DISPLAY_BUDDY");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(true);
  });

  test("lookup slash does not set expected-render without drift", async () => {
    const claudeDir = freshClaudeDir();

    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "warm");

    expect(result.exitCode).toBe(0);
    expect(additionalContext(result.stdout)).toContain("BUDDY_RENDER_BEGIN");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("mutate success does not set expected-render without drift", async () => {
    const claudeDir = freshClaudeDir();

    const result = await runHook({ prompt: "/buddy-onchain lite" }, claudeDir);

    expect(result.exitCode).toBe(0);
    expect(additionalContext(result.stdout)).toBe(mutationContext("lite"));
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("invalid slash verb does not set expected-render without drift", async () => {
    const claudeDir = freshClaudeDir();

    const result = await runHook({ prompt: "/buddy-onchain ultra" }, claudeDir);

    expect(result.exitCode).toBe(0);
    expect(additionalContext(result.stdout)).toContain("unknown verb `ultra`");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("ambient cadence skip does not set expected-render without drift", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, { mode: "lite", turnCounter: 1 });

    const result = await runHook({ prompt: "cadence skip no drift" }, claudeDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("stale expected-render is wiped on slash route and not re-set", async () => {
    const claudeDir = freshClaudeDir();
    seedExpectedRenderFlag(claudeDir);

    const result = await runHook({ prompt: "/buddy-onchain" }, claudeDir, "warm");

    expect(result.exitCode).toBe(0);
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("stale expected-render is wiped on cadence skip and not re-set", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, { mode: "lite", turnCounter: 1 });
    seedExpectedRenderFlag(claudeDir);

    const result = await runHook({ prompt: "stale flag cadence skip" }, claudeDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("stale expected-render is wiped then re-set on ambient warm success", async () => {
    const claudeDir = freshClaudeDir();
    const projectDir = join(claudeDir, "project");
    mkdirSync(projectDir);
    seedBuddyState(claudeDir, { turnCounter: 0 });
    seedArtCache(claudeDir);
    seedExpectedRenderFlag(claudeDir);

    const result = await runHook(
      { prompt: "stale flag ambient success" },
      claudeDir,
      "throw",
      { CLAUDE_PROJECT_DIR: projectDir, BUDDY_NETWORK: "local" },
    );

    expect(result.exitCode).toBe(0);
    expect(additionalContext(result.stdout)).toContain("DISPLAY_BUDDY");
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(true);
  });
});

describe("hook — soft-fail discipline", () => {
  test("malformed stdin payload emits {}", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runDistHook("this is not json {{", claudeDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
  });

  test("outer catch preserves drift flag for the next turn", async () => {
    const claudeDir = freshClaudeDir();
    seedBuddyState(claudeDir, {
      chainId: null,
      contractAddress: null,
      hatch: "warm",
      tokenId: "0x2a",
      turnCounter: 0,
    });
    seedDriftFlag(claudeDir);

    const result = await runHook(
      { prompt: "force getActiveNetwork throw" },
      claudeDir,
      "throw",
      { BUDDY_NETWORK: "invalid-network" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(existsSync(driftFlagPath(claudeDir))).toBe(true);
  });
});

describe("index CLI --stop", () => {
  test("--stop routes to Stop hook", async () => {
    const claudeDir = freshClaudeDir();
    seedExpectedRenderFlag(claudeDir);

    const result = await runSourceCli(["--stop"], claudeDir, {
      last_assistant_message: "assistant text without buddy block",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).toBe("");
    expect(existsSync(driftFlagPath(claudeDir))).toBe(true);
    expect(existsSync(expectedRenderFlagPath(claudeDir))).toBe(false);
  });

  test("--stop --hook exits with mutex error", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runSourceCli(["--stop", "--hook"], claudeDir);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("mutually exclusive");
  });

  test("--stop --session-start exits with mutex error", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runSourceCli(["--stop", "--session-start"], claudeDir);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("mutually exclusive");
  });

  test("--stop --uuid exits with mutex error", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runSourceCli(["--stop", "--uuid", TEST_UUID], claudeDir);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("mutually exclusive");
  });

  test("--help lists --stop", async () => {
    const claudeDir = freshClaudeDir();
    const result = await runSourceCli(["--help"], claudeDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--stop");
  });
});

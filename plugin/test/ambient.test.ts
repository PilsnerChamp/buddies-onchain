/**
 * Tests for `plugin/src/ambient.ts` — the on-disk state machine that
 * drives sprite-frame rotation for the UserPromptSubmit ambient hook.
 *
 * Ambient render paths are exercised through a subprocess so HOME /
 * CLAUDE_CONFIG_DIR are fixed before `node:os.homedir()` is read. What
 * we lock down:
 *   - `nextFrame` rotates f0 → f1 → f2 → fb → f0
 *   - state file round-trips and rejects mismatched versions / corrupt
 *     payloads without throwing
 *   - `buildAdditionalContext` emits the DISPLAY_BUDDY anchor plus a
 *     fenced sprite block. SessionStart owns the heavy instruction text.
 *   - `stateFilePath` segments by project + account + chain
 *   - `renderAmbientFrame` reads only the art cache and never needs a
 *     chain-client mock
 */

import { afterEach, describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAdditionalContext,
  nextFrame,
  readState,
  stateFilePath,
  writeState,
  type AmbientState,
} from "../src/ambient";
import type { BuddyArtCacheV1 } from "../src/art-cache";

const tmpDirs: string[] = [];
const TEST_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
const PLUGIN_ROOT = join(import.meta.dir, "..");

// Plugin runtime is Base mainnet only; identity fixtures must match what
// `getActiveNetwork()` resolves (chainId 8453 + the mainnet BuddyNFT address
// from `plugin/deployments/8453.json`).
const MAINNET_IDENTITY = {
  accountUuidHash: createHash("sha256").update(TEST_UUID).digest("hex"),
  chainId: 8453,
  contractAddress: "0x5684082f1219ecb61cbd2e8ec2df537104a48fc9",
};

function freshTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "buddy-ambient-"));
  tmpDirs.push(d);
  return d;
}

function writeClaudeConfig(root: string): void {
  writeFileSync(
    join(root, ".claude.json"),
    JSON.stringify({ oauthAccount: { accountUuid: TEST_UUID } }),
  );
}

function artCache(overrides: Partial<BuddyArtCacheV1> = {}): BuddyArtCacheV1 {
  return {
    schemaVersion: 1,
    ...MAINNET_IDENTITY,
    tokenId: "0x2a",
    frames: {
      f0: ["frame zero"],
      f1: ["frame one"],
      f2: ["frame two"],
      fb: ["frame blink"],
    },
    cachedAtMs: 12345,
    ...overrides,
  };
}

async function renderAmbientFrames(options: {
  root: string;
  projectDir: string;
  cache?: BuddyArtCacheV1;
  tokenId?: string;
  count?: number;
}): Promise<{ frames: unknown[]; cursor: unknown; stdout: string; stderr: string }> {
  writeClaudeConfig(options.root);

  const script = `
    import { readFileSync } from "node:fs";
    import { getActiveNetwork } from "./src/network.ts";
    import { renderAmbientFrame, stateFilePath } from "./src/ambient.ts";
    import { writeArtCache } from "./src/art-cache.ts";

    const cache = process.env.BUDDY_TEST_CACHE;
    if (cache) {
      writeArtCache(JSON.parse(cache));
    }

    const net = getActiveNetwork();
    const frames = [];
    for (let i = 0; i < Number(process.env.BUDDY_TEST_COUNT); i++) {
      frames.push(await renderAmbientFrame({
        projectDir: process.env.CLAUDE_PROJECT_DIR,
        accountUuid: process.env.BUDDY_TEST_UUID,
        tokenId: BigInt(process.env.BUDDY_TEST_TOKEN_ID),
        net,
      }));
    }

    let cursor = null;
    try {
      cursor = JSON.parse(readFileSync(
        stateFilePath(
          process.env.CLAUDE_PROJECT_DIR,
          process.env.BUDDY_TEST_UUID,
          net.chainId,
        ),
        "utf8",
      ));
    } catch {
      cursor = null;
    }

    console.log(JSON.stringify({ frames, cursor }));
  `;

  const proc = Bun.spawn(["bun", "--eval", script], {
    cwd: PLUGIN_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: options.root,
      CLAUDE_CONFIG_DIR: options.root,
      CLAUDE_PROJECT_DIR: options.projectDir,
      BUDDY_TEST_UUID: TEST_UUID,
      BUDDY_TEST_TOKEN_ID: options.tokenId ?? "0x2a",
      BUDDY_TEST_COUNT: String(options.count ?? 1),
      BUDDY_TEST_CACHE: options.cache === undefined ? "" : JSON.stringify(options.cache),
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  expect(proc.exitCode).toBe(0);
  expect(stderr).toBe("");

  return { ...JSON.parse(stdout), stdout, stderr };
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const d = tmpDirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

describe("nextFrame", () => {
  test("fresh state (lastFrameIndex=-1) returns f0", () => {
    expect(nextFrame({ lastFrameIndex: -1, accountUuid: null, chainId: null })).toEqual({
      id: "f0",
      index: 0,
    });
  });

  test("rotates f0 → f1 → f2 → fb → f0", () => {
    const seen: string[] = [];
    let state: AmbientState = { lastFrameIndex: -1, accountUuid: null, chainId: null };
    for (let i = 0; i < 5; i++) {
      const n = nextFrame(state);
      seen.push(n.id);
      state = { ...state, lastFrameIndex: n.index };
    }
    expect(seen).toEqual(["f0", "f1", "f2", "fb", "f0"]);
  });

  test("out-of-range lastFrameIndex normalizes back into the cycle", () => {
    expect(nextFrame({ lastFrameIndex: 99, accountUuid: null, chainId: null }).id).toBe("f0");
    expect(nextFrame({ lastFrameIndex: -7, accountUuid: null, chainId: null }).id).toBe("f2");
  });
});

describe("readState / writeState", () => {
  test("round-trips a written state", () => {
    const path = join(freshTmp(), "state.json");
    const s: AmbientState = { lastFrameIndex: 2, accountUuid: "abc", chainId: 31337 };
    writeState(path, s);
    expect(readState(path)).toEqual(s);
  });

  test("missing file returns fresh defaults (lastFrameIndex=-1)", () => {
    const path = join(freshTmp(), "missing.json");
    expect(readState(path)).toEqual({
      lastFrameIndex: -1,
      accountUuid: null,
      chainId: null,
    });
  });

  test("corrupt payload returns fresh defaults instead of throwing", () => {
    const path = join(freshTmp(), "corrupt.json");
    writeFileSync(path, "{not json", "utf8");
    expect(readState(path)).toEqual({
      lastFrameIndex: -1,
      accountUuid: null,
      chainId: null,
    });
  });

  test("mismatched version is treated as corrupt (forward-compat)", () => {
    const path = join(freshTmp(), "v0.json");
    writeFileSync(
      path,
      JSON.stringify({ version: 999, lastFrameIndex: 3 }),
      "utf8",
    );
    expect(readState(path).lastFrameIndex).toBe(-1);
  });

  test("writeState creates parent directories on first write", () => {
    const path = join(freshTmp(), "nested", "deep", "state.json");
    writeState(path, { lastFrameIndex: 1, accountUuid: "x", chainId: 1 });
    expect(existsSync(path)).toBe(true);
  });
});

describe("stateFilePath", () => {
  test("segments by project, account, and chain", () => {
    const a = stateFilePath("/proj/one", "uuid-A", 31337);
    const b = stateFilePath("/proj/two", "uuid-A", 31337);
    const c = stateFilePath("/proj/one", "uuid-B", 31337);
    const d = stateFilePath("/proj/one", "uuid-A", 8453);
    expect(new Set([a, b, c, d]).size).toBe(4);
    expect(a).toContain("uuid-A");
    expect(a).toContain("31337");
    expect(a.endsWith("state.json")).toBe(true);
  });

  test("same project+account+chain is stable across calls", () => {
    expect(stateFilePath("/p", "u", 1)).toBe(stateFilePath("/p", "u", 1));
  });
});

describe("buildAdditionalContext", () => {
  test("emits DISPLAY_BUDDY plus a fenced code block with no language tag", () => {
    const out = buildAdditionalContext(["row a", "row b"]);
    expect(out.startsWith("DISPLAY_BUDDY [render block top of reply; fill jokes right of |]\n\n")).toBe(true);
    // No leading whitespace to dedent; one-space left margin + ` | ` suffix.
    expect(out).toContain("\n```\n row a | \n row b | \n```");
  });

  test("empty options preserve existing output bytes", () => {
    expect(buildAdditionalContext(["row a", "row b"], {})).toBe(
      [
        "DISPLAY_BUDDY [render block top of reply; fill jokes right of |]",
        "",
        "```",
        " row a | ",
        " row b | ",
        "```",
      ].join("\n"),
    );
  });

  test("writes joke overrides right of the separator", () => {
    const out = buildAdditionalContext(
      ["one", "two", "three", "four", "five"],
      { jokeOverrides: ["joke a", "joke b", null, null, null] },
    );

    expect(out).toBe(
      [
        "DISPLAY_BUDDY [render block top of reply; fill jokes right of |]",
        "",
        "```",
        " one   | joke a",
        " two   | joke b",
        " three | ",
        " four  | ",
        " five  | ",
        "```",
      ].join("\n"),
    );
  });

  test("cold nudge directive appears above DISPLAY_BUDDY when active", () => {
    const out = buildAdditionalContext(["row"], { coldNudgeActive: true });

    expect(out).toContain("COLD_NUDGE [pre-filled joke cells take precedence");
    expect(out!.indexOf("COLD_NUDGE")).toBeLessThan(
      out!.indexOf("DISPLAY_BUDDY"),
    );
  });

  test("mixed null and non-null overrides keep null cells blank", () => {
    const out = buildAdditionalContext(
      ["a", "bb", "ccc"],
      { jokeOverrides: [null, "joke b", null] },
    );

    expect(out).toContain("\n a   | \n");
    expect(out).toContain("\n bb  | joke b\n");
    expect(out).toContain("\n ccc | \n");
  });

  test("pads short rows to the row-set's max width before the `|` separator", () => {
    const rows = ["short", "much-longer-row"];
    const out = buildAdditionalContext(rows);
    // Width = 15 (length of "much-longer-row"); "short" gets 10 trailing spaces.
    expect(out).toContain("\n short           | \n");
    expect(out).toContain("\n much-longer-row | \n");
  });

  test("strips common left margin and anchors a single-row sprite", () => {
    const rows = ["    .[||]."];
    const out = buildAdditionalContext(rows);
    // 4 spaces of common lead stripped → ".[||]." (len 6); width 6; one-space prefix.
    expect(out).toContain("\n .[||]. | \n");
  });

  test("anchors sprite to top by dropping leading whitespace-only rows", () => {
    const rows = [
      "                 ",
      "      .[||].",
      "     [ ·  · ]",
      "     [ ==== ]",
      "     `------´",
    ];
    const out = buildAdditionalContext(rows);
    // Empty top row dropped; min lead across remaining = 5 → strip 5; width 8.
    // Row 0 ".[||]." padded to width 8 with one trailing space → "  .[||].  | ".
    expect(out).toContain("\n  .[||].  | \n");
    expect(out).toContain("\n [ ·  · ] | \n");
    expect(out).toContain("\n [ ==== ] | \n");
    expect(out).toContain("\n `------´ | \n");
    // Empty top row must NOT survive into the rendered block.
    expect(out).not.toMatch(/\n {15,} \| \n/);
  });

  test("interior and trailing whitespace-only rows collapse so they do not inflate width", () => {
    const rows = [
      "   visible-A",
      "                                ",
      "   visible-B",
      "                  ",
    ];
    const out = buildAdditionalContext(rows);
    // Common lead = 3 (computed from non-blank rows). The 32-char interior
    // and 18-char trailing blank rows would, without collapse, push the `|`
    // column far right because they have no leading whitespace to strip.
    // Collapsed to "", they pad to `visible-A`/`visible-B` width (9) instead.
    expect(out).toContain("\n visible-A | \n");
    expect(out).toContain("\n visible-B | \n");
    // Blank rows render as ` ${" "*9} | `: 1-space prefix + width 9 padded +
    // separator space = 11 spaces before `|`. Must match the visible-row
    // column exactly, never push further right because of a wide blank.
    expect(out).toMatch(/\n {11}\| \n/);
    expect(out).not.toMatch(/\n {12,}\| \n/);
    // Both interior and trailing blank rows present in output.
    const blankRowMatches = out!.match(/\n {11}\| \n/g) ?? [];
    expect(blankRowMatches.length).toBe(2);
  });

  test("all-whitespace input fails closed to null (caller routes to `{}`)", () => {
    // Emitting `DISPLAY_BUDDY` with an empty fenced block would still trip
    // the ambient ruleset on the model side. Caller treats null as "skip
    // this turn" and emits `{}` instead.
    expect(buildAdditionalContext(["    ", "          "])).toBeNull();
    expect(buildAdditionalContext([])).toBeNull();
    expect(buildAdditionalContext([""])).toBeNull();
  });

  test("does not repeat SessionStart instruction prose", () => {
    const out = buildAdditionalContext(["x"]);
    expect(out).not.toMatch(/Buddies Onchain ambient signal/i);
    expect(out).not.toMatch(/self-critical/i);
    expect(out).not.toMatch(/skip only when/i);
  });
});

describe("renderAmbientFrame", () => {
  test("reads sprite rows from the art cache without a chain-client mock", async () => {
    const root = freshTmp();
    const projectDir = join(root, "project");
    mkdirSync(projectDir);

    const out = await renderAmbientFrames({
      root,
      projectDir,
      cache: artCache(),
    });

    expect(out.frames).toEqual([{ rows: ["frame zero"], frameId: "f0" }]);
    expect(out.cursor).toMatchObject({ lastFrameIndex: 0 });
  });

  test("cache miss returns null and leaves cursor absent", async () => {
    const root = freshTmp();
    const projectDir = join(root, "project");
    mkdirSync(projectDir);

    const out = await renderAmbientFrames({ root, projectDir });

    expect(out.frames).toEqual([null]);
    expect(out.cursor).toBeNull();
  });

  test("identity mismatch returns null", async () => {
    const root = freshTmp();
    const projectDir = join(root, "project");
    mkdirSync(projectDir);

    const out = await renderAmbientFrames({
      root,
      projectDir,
      cache: artCache({ accountUuidHash: "b".repeat(64) }),
    });

    expect(out.frames).toEqual([null]);
    expect(out.cursor).toBeNull();
  });

  test("token mismatch returns null", async () => {
    const root = freshTmp();
    const projectDir = join(root, "project");
    mkdirSync(projectDir);

    const out = await renderAmbientFrames({
      root,
      projectDir,
      cache: artCache({ tokenId: "0x2b" }),
    });

    expect(out.frames).toEqual([null]);
    expect(out.cursor).toBeNull();
  });

  test("frame rotation advances cursor on cache-backed emits", async () => {
    const root = freshTmp();
    const projectDir = join(root, "project");
    mkdirSync(projectDir);

    const out = await renderAmbientFrames({
      root,
      projectDir,
      cache: artCache(),
      count: 2,
    });

    expect(out.frames).toEqual([
      { rows: ["frame zero"], frameId: "f0" },
      { rows: ["frame one"], frameId: "f1" },
    ]);
    expect(out.cursor).toMatchObject({ lastFrameIndex: 1 });
  });
});

// `isExplicitBuddySurface` removed in phase 3 — replaced by
// `routePrompt` in `command-router.ts`, which is the single source of
// truth for slash-command classification (full-string anchored,
// case-sensitive token, deterministic mute via the `lookup` route).
// Boundary-case coverage moved to `command-router.test.ts`.

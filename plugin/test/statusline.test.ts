import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const STATUSLINE = join(import.meta.dir, "..", "hooks", "buddy-statusline.sh");
const BADGE = (eyes: string, mode: string) =>
  `\x1b[34m[${eyes}:${mode}]\x1b[0m`;

const tmpDirs: string[] = [];

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buddy-statusline-"));
  tmpDirs.push(root);
  return root;
}

function statePath(root: string): string {
  return join(root, "plugins", "buddy-onchain", ".buddy-state");
}

function heartbeatPath(root: string): string {
  return join(root, "plugins", "buddy-onchain", ".badge-heartbeat");
}

function projectHeartbeatPath(root: string, projectDir: string): string {
  // Mirrors plugin-paths.ts::projectBadgeHeartbeatPath — first 16 hex chars
  // of sha256(projectDir).
  const key = createHash("sha256").update(projectDir).digest("hex").slice(0, 16);
  return join(root, "plugins", "buddy-onchain", "projects", key, ".badge-heartbeat");
}

function statuslineStdin(projectDir: string): string {
  return JSON.stringify({
    session_id: "s",
    workspace: { current_dir: projectDir, project_dir: projectDir },
  });
}

function writeState(root: string, mode: string, hatch: string): void {
  const path = statePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 4,
      mode,
      hatch,
      tokenId: hatch === "warm" ? "0x2a" : null,
      accountUuidHash: "a".repeat(64),
      chainId: 31337,
      contractAddress: "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9",
      turnCounter: 0,
      coldNudgeCounter: 0,
    }),
  );
}

async function runStatusline(
  root: string,
  buddyMode = "",
  stdinText?: string,
  pathOverride?: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["sh", STATUSLINE], {
    // Closed stdin by default — the script must render without a payload
    // (and must never block waiting for one).
    stdin: stdinText === undefined ? "ignore" : Buffer.from(stdinText),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: pathOverride ?? process.env.PATH ?? "",
      HOME: root,
      CLAUDE_CONFIG_DIR: root,
      BUDDY_MODE: buddyMode,
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("buddy-statusline.sh — defensive reads", () => {
  test("missing state file exits 0 silently", async () => {
    const result = await runStatusline(freshRoot());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("symlink state file exits 0 silently", async () => {
    if (process.platform === "win32") {
      return;
    }

    const root = freshRoot();
    const target = join(root, "real-state.json");
    writeFileSync(target, JSON.stringify({ mode: "full", hatch: "warm" }));
    mkdirSync(dirname(statePath(root)), { recursive: true });
    symlinkSync(target, statePath(root));

    const result = await runStatusline(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("corrupt JSON exits 0 silently", async () => {
    const root = freshRoot();
    mkdirSync(dirname(statePath(root)), { recursive: true });
    writeFileSync(statePath(root), "{ not json");

    const result = await runStatusline(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("empty file exits 0 silently", async () => {
    const root = freshRoot();
    mkdirSync(dirname(statePath(root)), { recursive: true });
    writeFileSync(statePath(root), "");

    const result = await runStatusline(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});

describe("buddy-statusline.sh — badge derivation", () => {
  test.each([
    ["warm", "off", "@,@", "off"],
    ["warm", "lite", "@,@", "lite"],
    ["warm", "full", "@,@", "full"],
    ["cold", "off", "-,-", "off"],
    ["cold", "lite", "-,-", "lite"],
    ["cold", "full", "-,-", "full"],
    ["unknown", "off", "-,-", "off"],
    ["unknown", "lite", "-,-", "lite"],
    ["unknown", "full", "-,-", "full"],
  ] as const)(
    "%s + %s renders [%s:%s]",
    async (hatch, mode, eyes, suffix) => {
      const root = freshRoot();
      writeState(root, mode, hatch);

      const result = await runStatusline(root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(BADGE(eyes, suffix));
      expect(result.stderr).toBe("");
    },
  );

  test("env off overrides persisted full", async () => {
    const root = freshRoot();
    writeState(root, "full", "cold");

    const result = await runStatusline(root, "off");

    expect(result.stdout).toBe(BADGE("-,-", "off"));
  });

  test("env full overrides persisted off", async () => {
    const root = freshRoot();
    writeState(root, "off", "cold");

    const result = await runStatusline(root, "full");

    expect(result.stdout).toBe(BADGE("-,-", "full"));
  });

  test("invalid env is ignored, persisted wins", async () => {
    const root = freshRoot();
    writeState(root, "lite", "cold");

    const result = await runStatusline(root, "garbage");

    expect(result.stdout).toBe(BADGE("-,-", "lite"));
  });

  test("env matching persisted leaves suffix unchanged", async () => {
    const root = freshRoot();
    writeState(root, "lite", "cold");

    const result = await runStatusline(root, "lite");

    expect(result.stdout).toBe(BADGE("-,-", "lite"));
  });

  test("control bytes are stripped before parsing", async () => {
    const root = freshRoot();
    mkdirSync(dirname(statePath(root)), { recursive: true });

    const payload = Buffer.from(
      '{\u0000\u0001"mode"\u0002:\u0003"full",\u0004"hatch"\u0005:\u0006"warm"}',
      "utf8",
    );
    writeFileSync(statePath(root), payload);

    const result = await runStatusline(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(result.stderr).toBe("");
  });
});

describe("buddy-statusline.sh — badge heartbeat", () => {
  test("touches the heartbeat on a normal render", async () => {
    const root = freshRoot();
    writeState(root, "full", "warm");

    const result = await runStatusline(root);

    expect(result.exitCode).toBe(0);
    expect(existsSync(heartbeatPath(root))).toBe(true);
  });

  test("touches the heartbeat even on the silent missing-state path", async () => {
    // Heartbeat means "script runs in the statusline loop", not "badge
    // visible" — wiring detection must survive an empty badge.
    const root = freshRoot();

    const result = await runStatusline(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(heartbeatPath(root))).toBe(true);
  });

  test("bumps a stale heartbeat mtime forward", async () => {
    const root = freshRoot();
    writeState(root, "lite", "cold");
    mkdirSync(dirname(heartbeatPath(root)), { recursive: true });
    writeFileSync(heartbeatPath(root), "");
    const past = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(heartbeatPath(root), past, past);

    await runStatusline(root);

    const ageMs = Date.now() - statSync(heartbeatPath(root)).mtimeMs;
    expect(ageMs).toBeLessThan(60 * 1000);
  });

  test("never follows a symlinked heartbeat", async () => {
    if (process.platform === "win32") {
      return;
    }

    const root = freshRoot();
    writeState(root, "full", "warm");
    const target = join(root, "heartbeat-target");
    writeFileSync(target, "");
    const past = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(target, past, past);
    symlinkSync(target, heartbeatPath(root));

    const result = await runStatusline(root);

    // Badge still renders; the symlink target's mtime stays untouched.
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(statSync(target).mtimeMs).toBe(past.getTime());
    expect(lstatSync(heartbeatPath(root)).isSymbolicLink()).toBe(true);
  });
});

describe("buddy-statusline.sh — per-project badge heartbeat", () => {
  const PROJECT_DIR = "/home/someone/repos/some-project";

  test("stdin payload with project_dir touches the per-project heartbeat", async () => {
    const root = freshRoot();
    writeState(root, "full", "warm");

    const result = await runStatusline(root, "", statuslineStdin(PROJECT_DIR));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(result.stderr).toBe("");
    expect(existsSync(heartbeatPath(root))).toBe(true);
    expect(existsSync(projectHeartbeatPath(root, PROJECT_DIR))).toBe(true);
  });

  test("per-project heartbeat fires even on the silent missing-state path", async () => {
    const root = freshRoot();

    const result = await runStatusline(root, "", statuslineStdin(PROJECT_DIR));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(projectHeartbeatPath(root, PROJECT_DIR))).toBe(true);
  });

  test("bumps a stale per-project heartbeat mtime forward", async () => {
    const root = freshRoot();
    writeState(root, "lite", "cold");
    const path = projectHeartbeatPath(root, PROJECT_DIR);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "");
    const past = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(path, past, past);

    await runStatusline(root, "", statuslineStdin(PROJECT_DIR));

    const ageMs = Date.now() - statSync(path).mtimeMs;
    expect(ageMs).toBeLessThan(60 * 1000);
  });

  test("no stdin payload touches only the global heartbeat", async () => {
    const root = freshRoot();
    writeState(root, "full", "warm");

    const result = await runStatusline(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(existsSync(heartbeatPath(root))).toBe(true);
    expect(existsSync(join(root, "plugins", "buddy-onchain", "projects"))).toBe(false);
  });

  test("malformed stdin still renders the badge and skips the project touch", async () => {
    const root = freshRoot();
    writeState(root, "full", "warm");

    const result = await runStatusline(root, "", "{ not json");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(result.stderr).toBe("");
    expect(existsSync(join(root, "plugins", "buddy-onchain", "projects"))).toBe(false);
  });

  test("project_dir containing JSON escapes is skipped, not mis-hashed", async () => {
    // A backslash in the JSON string means the naive sed parse cannot
    // round-trip the real path — the script must skip rather than hash a
    // mangled string that would never match the reader's key.
    const root = freshRoot();
    writeState(root, "full", "warm");
    const stdin = '{"workspace":{"project_dir":"C:\\\\Users\\\\dev\\\\repo"}}';

    const result = await runStatusline(root, "", stdin);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(existsSync(join(root, "plugins", "buddy-onchain", "projects"))).toBe(false);
  });

  test("never follows a symlinked per-project heartbeat", async () => {
    if (process.platform === "win32") {
      return;
    }

    const root = freshRoot();
    writeState(root, "full", "warm");
    const path = projectHeartbeatPath(root, PROJECT_DIR);
    const target = join(root, "project-heartbeat-target");
    writeFileSync(target, "");
    const past = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(target, past, past);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(target, path);

    const result = await runStatusline(root, "", statuslineStdin(PROJECT_DIR));

    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(statSync(target).mtimeMs).toBe(past.getTime());
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
  });
});

describe("buddy-statusline.sh — sha tool fallback chain", () => {
  const PROJECT_DIR = "/home/someone/repos/fallback-project";

  // Restricted PATH: symlink only the tools the script needs plus the
  // digest tool under test. Omitting `sha256sum` deterministically forces
  // the `shasum` branch; omitting both forces `openssl`. Returns null when
  // a required tool is unavailable on this machine (test skips).
  function restrictedBinDir(digestTools: string[]): string | null {
    const base = ["sh", "head", "tr", "sed", "cut", "mkdir", "touch", "wc"];
    const bin = mkdtempSync(join(tmpdir(), "buddy-restricted-bin-"));
    tmpDirs.push(bin);
    for (const tool of [...base, ...digestTools]) {
      const src = Bun.which(tool);
      if (src === null) return null;
      symlinkSync(src, join(bin, tool));
    }
    return bin;
  }

  test("falls back to shasum when sha256sum is absent", async () => {
    const bin = restrictedBinDir(["shasum"]);
    if (bin === null) return; // shasum not installed here — skip

    const root = freshRoot();
    writeState(root, "full", "warm");

    const result = await runStatusline(root, "", statuslineStdin(PROJECT_DIR), bin);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(result.stderr).toBe("");
    expect(existsSync(projectHeartbeatPath(root, PROJECT_DIR))).toBe(true);
  });

  test("falls back to openssl when sha256sum and shasum are absent", async () => {
    const bin = restrictedBinDir(["openssl"]);
    if (bin === null) return; // openssl not installed here — skip

    const root = freshRoot();
    writeState(root, "full", "warm");

    const result = await runStatusline(root, "", statuslineStdin(PROJECT_DIR), bin);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(result.stderr).toBe("");
    expect(existsSync(projectHeartbeatPath(root, PROJECT_DIR))).toBe(true);
  });

  test("no digest tool skips the project touch but still renders", async () => {
    const bin = restrictedBinDir([]);
    if (bin === null) return;

    const root = freshRoot();
    writeState(root, "full", "warm");

    const result = await runStatusline(root, "", statuslineStdin(PROJECT_DIR), bin);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(BADGE("@,@", "full"));
    expect(result.stderr).toBe("");
    expect(existsSync(heartbeatPath(root))).toBe(true);
    expect(existsSync(join(root, "plugins", "buddy-onchain", "projects"))).toBe(false);
  });
});

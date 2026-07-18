import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  hasGlobalBadgeHeartbeat,
  hasProjectBadgeHeartbeat,
} from "../src/badge-heartbeat";

const PROJECT_DIR = "/some/project/dir";

let root: string;
let savedConfigDir: string | undefined;

function projectKey(projectDir: string): string {
  return createHash("sha256").update(projectDir).digest("hex").slice(0, 16);
}

function globalHeartbeatPath(): string {
  return join(root, "plugins", "buddy-onchain", ".badge-heartbeat");
}

function projectHeartbeatPath(projectDir: string): string {
  return join(
    root,
    "plugins",
    "buddy-onchain",
    "projects",
    projectKey(projectDir),
    ".badge-heartbeat",
  );
}

function writeHeartbeat(path: string, mtime?: Date): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
  if (mtime !== undefined) {
    utimesSync(path, mtime, mtime);
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "badge-heartbeat-"));
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = root;
});

afterEach(() => {
  if (savedConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  }
  rmSync(root, { recursive: true, force: true });
});

describe("hasGlobalBadgeHeartbeat", () => {
  test("missing heartbeat is a certain miss", () => {
    expect(hasGlobalBadgeHeartbeat()).toBe(false);
  });

  test("existing heartbeat is detected", () => {
    writeHeartbeat(globalHeartbeatPath());

    expect(hasGlobalBadgeHeartbeat()).toBe(true);
  });

  test("old mtime still counts as wired — renders are event-driven", () => {
    // An idle session produces no renders; a stale mtime must not read as
    // "unwired" or every lull would trigger a false nag.
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    writeHeartbeat(globalHeartbeatPath(), past);

    expect(hasGlobalBadgeHeartbeat()).toBe(true);
  });

  test("symlinked heartbeat is never followed — counts as a miss", () => {
    if (process.platform === "win32") {
      return;
    }

    // A symlink TARGET must not pass: the writer scripts refuse to touch a
    // symlinked heartbeat, so its existence proves nothing about wiring.
    const target = join(root, "heartbeat-target");
    writeFileSync(target, "");
    mkdirSync(dirname(globalHeartbeatPath()), { recursive: true });
    symlinkSync(target, globalHeartbeatPath());

    expect(hasGlobalBadgeHeartbeat()).toBe(false);
  });

  test("non-regular heartbeat (directory) counts as a miss", () => {
    mkdirSync(globalHeartbeatPath(), { recursive: true });

    expect(hasGlobalBadgeHeartbeat()).toBe(false);
  });
});

describe("hasProjectBadgeHeartbeat", () => {
  test("missing project heartbeat is a certain miss", () => {
    expect(hasProjectBadgeHeartbeat(PROJECT_DIR)).toBe(false);
  });

  test("existing project heartbeat is detected", () => {
    writeHeartbeat(projectHeartbeatPath(PROJECT_DIR));

    expect(hasProjectBadgeHeartbeat(PROJECT_DIR)).toBe(true);
  });

  test("old mtime still counts as wired — renders are event-driven", () => {
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    writeHeartbeat(projectHeartbeatPath(PROJECT_DIR), past);

    expect(hasProjectBadgeHeartbeat(PROJECT_DIR)).toBe(true);
  });

  test("global heartbeat does not vouch for the project", () => {
    writeHeartbeat(globalHeartbeatPath());

    expect(hasProjectBadgeHeartbeat(PROJECT_DIR)).toBe(false);
  });

  test("another project's heartbeat does not vouch for this one", () => {
    writeHeartbeat(projectHeartbeatPath("/other/project"));

    expect(hasProjectBadgeHeartbeat(PROJECT_DIR)).toBe(false);
  });

  test("symlinked project heartbeat is never followed — counts as a miss", () => {
    if (process.platform === "win32") {
      return;
    }

    const target = join(root, "heartbeat-target");
    writeFileSync(target, "");
    mkdirSync(dirname(projectHeartbeatPath(PROJECT_DIR)), { recursive: true });
    symlinkSync(target, projectHeartbeatPath(PROJECT_DIR));

    expect(hasProjectBadgeHeartbeat(PROJECT_DIR)).toBe(false);
  });
});

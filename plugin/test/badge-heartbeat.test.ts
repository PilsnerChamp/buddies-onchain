import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
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

import {
  HEARTBEAT_MAX_AGE_MS,
  isBadgeHeartbeatFresh,
} from "../src/badge-heartbeat";

let root: string;
let savedConfigDir: string | undefined;

function heartbeatPath(): string {
  return join(root, "plugins", "buddy-onchain", ".badge-heartbeat");
}

function writeHeartbeat(mtime?: Date): void {
  mkdirSync(dirname(heartbeatPath()), { recursive: true });
  writeFileSync(heartbeatPath(), "");
  if (mtime !== undefined) {
    utimesSync(heartbeatPath(), mtime, mtime);
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

describe("isBadgeHeartbeatFresh", () => {
  test("missing heartbeat is a certain miss", () => {
    expect(isBadgeHeartbeatFresh()).toBe(false);
  });

  test("fresh heartbeat is detected", () => {
    writeHeartbeat();

    expect(isBadgeHeartbeatFresh()).toBe(true);
  });

  test("symlinked heartbeat is never followed — counts as a miss", () => {
    if (process.platform === "win32") {
      return;
    }

    // Fresh symlink TARGET must not pass: the writer scripts refuse to touch
    // a symlinked heartbeat, so a fresh target proves nothing about wiring.
    const target = join(root, "heartbeat-target");
    writeFileSync(target, "");
    mkdirSync(dirname(heartbeatPath()), { recursive: true });
    symlinkSync(target, heartbeatPath());

    expect(isBadgeHeartbeatFresh()).toBe(false);
  });

  test("heartbeat older than the window is stale", () => {
    const past = new Date(Date.now() - HEARTBEAT_MAX_AGE_MS - 60 * 1000);
    writeHeartbeat(past);

    expect(isBadgeHeartbeatFresh()).toBe(false);
  });

  test("boundary age still counts as fresh", () => {
    writeHeartbeat();
    // Read the mtime back — filesystems may round what utimes/write stored.
    const mtimeMs = statSync(heartbeatPath()).mtimeMs;

    expect(isBadgeHeartbeatFresh(mtimeMs + 1000, 1000)).toBe(true);
    expect(isBadgeHeartbeatFresh(mtimeMs + 1001, 1000)).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearDriftFlag,
  consumeExpectedRender,
  consumeSessionFresh,
  driftFlagPath,
  expectedRenderFlagPath,
  isDriftFlagSet,
  sessionFreshFlagPath,
  setDriftFlag,
  setExpectedRender,
  setSessionFresh,
} from "../src/drift-flag";

const tmpDirs: string[] = [];
let originalClaudeDir: string | undefined;

function freshTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "buddy-drift-flag-"));
  tmpDirs.push(dir);
  return dir;
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

describe("drift flag", () => {
  test("setDriftFlag creates file and isDriftFlagSet returns true after", () => {
    setDriftFlag();

    expect(existsSync(driftFlagPath())).toBe(true);
    expect(isDriftFlagSet()).toBe(true);
  });

  test("clearDriftFlag removes file and isDriftFlagSet returns false after", () => {
    setDriftFlag();

    clearDriftFlag();

    expect(existsSync(driftFlagPath())).toBe(false);
    expect(isDriftFlagSet()).toBe(false);
  });

  test("clearDriftFlag on missing file is a no-op", () => {
    expect(() => clearDriftFlag()).not.toThrow();
    expect(isDriftFlagSet()).toBe(false);
  });

  test("setDriftFlag is idempotent", () => {
    expect(() => {
      setDriftFlag();
      setDriftFlag();
    }).not.toThrow();
    expect(isDriftFlagSet()).toBe(true);
  });
});

describe("expected-render flag", () => {
  test("setExpectedRender creates expected-render file", () => {
    setExpectedRender();

    expect(existsSync(expectedRenderFlagPath())).toBe(true);
  });

  test("consumeExpectedRender returns true and removes file when set", () => {
    setExpectedRender();

    expect(consumeExpectedRender()).toBe(true);
    expect(existsSync(expectedRenderFlagPath())).toBe(false);
  });

  test("consumeExpectedRender returns false on missing file", () => {
    expect(() => {
      expect(consumeExpectedRender()).toBe(false);
    }).not.toThrow();
  });

  test("repeat consumeExpectedRender after first consume returns false", () => {
    setExpectedRender();

    expect(consumeExpectedRender()).toBe(true);
    expect(consumeExpectedRender()).toBe(false);
  });
});

describe("session-fresh flag", () => {
  test("setSessionFresh creates session-fresh file", () => {
    setSessionFresh();

    expect(existsSync(sessionFreshFlagPath())).toBe(true);
  });

  test("consumeSessionFresh returns true and removes file when set", () => {
    setSessionFresh();

    expect(consumeSessionFresh()).toBe(true);
    expect(existsSync(sessionFreshFlagPath())).toBe(false);
  });

  test("consumeSessionFresh returns false on missing file", () => {
    expect(() => {
      expect(consumeSessionFresh()).toBe(false);
    }).not.toThrow();
  });

  test("repeat consumeSessionFresh after first consume returns false", () => {
    setSessionFresh();

    expect(consumeSessionFresh()).toBe(true);
    expect(consumeSessionFresh()).toBe(false);
  });
});

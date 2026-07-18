import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureInstalledStatuslineScripts,
  migrateLegacyStatuslineWiring,
} from "../src/statusline-install";
import {
  bundledStatuslineScriptPath,
  STATUSLINE_SCRIPTS,
} from "../src/plugin-paths";

let root: string;
let savedConfigDir: string | undefined;

function installedPath(name: string): string {
  return join(root, "plugins", "buddy-onchain", name);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "statusline-install-"));
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

describe("ensureInstalledStatuslineScripts", () => {
  test("fresh boot copies both bundled scripts into the data dir", () => {
    ensureInstalledStatuslineScripts();

    for (const name of STATUSLINE_SCRIPTS) {
      const copied = readFileSync(installedPath(name));
      const bundled = readFileSync(bundledStatuslineScriptPath(name));
      expect(copied.equals(bundled)).toBe(true);
    }
  });

  test("outdated copy is refreshed to the bundled content", () => {
    ensureInstalledStatuslineScripts();
    writeFileSync(installedPath("buddy-statusline.sh"), "#!/bin/sh\n# old version\n");

    ensureInstalledStatuslineScripts();

    const copied = readFileSync(installedPath("buddy-statusline.sh"));
    const bundled = readFileSync(bundledStatuslineScriptPath("buddy-statusline.sh"));
    expect(copied.equals(bundled)).toBe(true);
  });

  test("identical copy is left untouched (no rewrite churn)", () => {
    ensureInstalledStatuslineScripts();
    const before = statSync(installedPath("buddy-statusline.sh")).mtimeMs;

    ensureInstalledStatuslineScripts();

    expect(statSync(installedPath("buddy-statusline.sh")).mtimeMs).toBe(before);
  });

  test("symlinked destination is refused, target untouched", () => {
    if (process.platform === "win32") {
      return;
    }

    ensureInstalledStatuslineScripts();
    const target = join(root, "foreign-target");
    writeFileSync(target, "foreign content");
    rmSync(installedPath("buddy-statusline.sh"));
    symlinkSync(target, installedPath("buddy-statusline.sh"));

    ensureInstalledStatuslineScripts();

    expect(readFileSync(target, "utf8")).toBe("foreign content");
  });

  test("never throws and leaves no tmp litter", () => {
    ensureInstalledStatuslineScripts();
    ensureInstalledStatuslineScripts();

    const dataDir = join(root, "plugins", "buddy-onchain");
    const litter = existsSync(dataDir)
      ? require("node:fs")
          .readdirSync(dataDir)
          .filter((f: string) => f.includes(".tmp-"))
      : [];
    expect(litter).toEqual([]);
  });

  test("a newer install's copy is never downgraded by an older session", () => {
    ensureInstalledStatuslineScripts();
    // Simulate a newer plugin having refreshed the copies: future version
    // sidecar + different script content.
    const sidecar = join(root, "plugins", "buddy-onchain", ".statusline-scripts-version");
    writeFileSync(sidecar, "999.0.0");
    writeFileSync(installedPath("buddy-statusline.sh"), "#!/bin/sh\n# from the future\n");

    ensureInstalledStatuslineScripts();

    expect(readFileSync(installedPath("buddy-statusline.sh"), "utf8")).toBe(
      "#!/bin/sh\n# from the future\n",
    );
  });

  test("an older sidecar version is refreshed and the sidecar advances", () => {
    ensureInstalledStatuslineScripts();
    const sidecar = join(root, "plugins", "buddy-onchain", ".statusline-scripts-version");
    writeFileSync(sidecar, "0.0.1");
    writeFileSync(installedPath("buddy-statusline.sh"), "#!/bin/sh\n# ancient\n");

    ensureInstalledStatuslineScripts();

    const copied = readFileSync(installedPath("buddy-statusline.sh"));
    const bundled = readFileSync(bundledStatuslineScriptPath("buddy-statusline.sh"));
    expect(copied.equals(bundled)).toBe(true);
    expect(readFileSync(sidecar, "utf8")).not.toBe("0.0.1");
  });

  test("a live foreign lock skips the refresh entirely", () => {
    ensureInstalledStatuslineScripts();
    writeFileSync(installedPath("buddy-statusline.sh"), "#!/bin/sh\n# drifted\n");
    const lock = join(root, "plugins", "buddy-onchain", ".statusline-scripts.lock");
    writeFileSync(lock, "12345"); // fresh mtime = live holder

    ensureInstalledStatuslineScripts();

    expect(readFileSync(installedPath("buddy-statusline.sh"), "utf8")).toBe(
      "#!/bin/sh\n# drifted\n",
    );
  });

  test("a stale lock is stolen and the refresh proceeds", () => {
    ensureInstalledStatuslineScripts();
    writeFileSync(installedPath("buddy-statusline.sh"), "#!/bin/sh\n# drifted\n");
    const lock = join(root, "plugins", "buddy-onchain", ".statusline-scripts.lock");
    writeFileSync(lock, "12345");
    const past = new Date(Date.now() - 5 * 60 * 1000);
    require("node:fs").utimesSync(lock, past, past);

    ensureInstalledStatuslineScripts();

    const copied = readFileSync(installedPath("buddy-statusline.sh"));
    const bundled = readFileSync(bundledStatuslineScriptPath("buddy-statusline.sh"));
    expect(copied.equals(bundled)).toBe(true);
    expect(existsSync(lock)).toBe(false);
  });

  test("an existing takeover claim blocks a second stealer", () => {
    if (process.platform === "win32") {
      return;
    }

    ensureInstalledStatuslineScripts();
    writeFileSync(installedPath("buddy-statusline.sh"), "#!/bin/sh\n# drifted\n");
    const fs = require("node:fs");
    const lock = join(root, "plugins", "buddy-onchain", ".statusline-scripts.lock");
    fs.writeFileSync(lock, "dead-holder");
    const past = new Date(Date.now() - 5 * 60 * 1000);
    fs.utimesSync(lock, past, past);
    // A rival claimant already holds the claim for this stale lock instance.
    const snap = fs.lstatSync(lock);
    fs.linkSync(lock, `${lock}.claim-${snap.ino}-${Math.floor(snap.mtimeMs)}`);

    ensureInstalledStatuslineScripts();

    // Takeover must back off: lock intact, no refresh.
    expect(fs.readFileSync(lock, "utf8")).toBe("dead-holder");
    expect(readFileSync(installedPath("buddy-statusline.sh"), "utf8")).toBe(
      "#!/bin/sh\n# drifted\n",
    );
  });

  test("garbage sidecar disengages the guard; refresh proceeds", () => {
    ensureInstalledStatuslineScripts();
    const sidecar = join(root, "plugins", "buddy-onchain", ".statusline-scripts-version");
    writeFileSync(sidecar, "not-a-version");
    writeFileSync(installedPath("buddy-statusline.sh"), "#!/bin/sh\n# drifted\n");

    ensureInstalledStatuslineScripts();

    const copied = readFileSync(installedPath("buddy-statusline.sh"));
    const bundled = readFileSync(bundledStatuslineScriptPath("buddy-statusline.sh"));
    expect(copied.equals(bundled)).toBe(true);
  });
});

describe("migrateLegacyStatuslineWiring", () => {
  const CACHE_SH =
    "/home/user/.claude/plugins/cache/buddies-onchain/buddy-onchain/1.2.0/hooks/buddy-statusline.sh";

  function settingsPath(): string {
    return join(root, "settings.json");
  }

  function stablePath(name: string): string {
    return join(root, "plugins", "buddy-onchain", name);
  }

  test("buddy cache-path wiring is rewritten to the stable copy, formatting preserved", () => {
    const raw = [
      "{",
      '  "model": "sonnet",',
      '  "statusLine": {',
      '    "type": "command",',
      `    "command": "bash \\"${CACHE_SH}\\""`,
      "  }",
      "}",
    ].join("\n");
    writeFileSync(settingsPath(), raw);

    migrateLegacyStatuslineWiring();

    const after = readFileSync(settingsPath(), "utf8");
    expect(after).toContain(`bash \\"${stablePath("buddy-statusline.sh")}\\"`);
    expect(after).not.toContain("/cache/");
    // Everything except the path is byte-identical.
    expect(after).toBe(raw.replaceAll(CACHE_SH, stablePath("buddy-statusline.sh")));
    expect(JSON.parse(after).model).toBe("sonnet");
  });

  test("ps1 cache wiring keeps the powershell flavor", () => {
    const cachePs1 =
      "C:\\Users\\dev\\.claude\\plugins\\cache\\buddies-onchain\\buddy-onchain\\1.2.0\\hooks\\buddy-statusline.ps1";
    const escaped = cachePs1.replaceAll("\\", "\\\\");
    writeFileSync(
      settingsPath(),
      `{"statusLine":{"type":"command","command":"powershell -ExecutionPolicy Bypass -File \\"${escaped}\\""}}`,
    );

    migrateLegacyStatuslineWiring();

    const after = readFileSync(settingsPath(), "utf8");
    expect(after).not.toContain("cache");
    expect(after).toContain("buddy-statusline.ps1");
    expect(() => JSON.parse(after)).not.toThrow();
  });

  test("identical full command in an earlier property is left untouched", () => {
    // The decoy precedes statusLine and contains the byte-identical command
    // value — a naive first-occurrence splice would rewrite the decoy and
    // leave the wiring broken.
    const raw = [
      "{",
      `  "wrapper": "bash \\"${CACHE_SH}\\"",`,
      '  "statusLine": {',
      '    "type": "command",',
      `    "command": "bash \\"${CACHE_SH}\\""`,
      "  }",
      "}",
    ].join("\n");
    writeFileSync(settingsPath(), raw);

    migrateLegacyStatuslineWiring();

    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as {
      wrapper: string;
      statusLine: { command: string };
    };
    expect(parsed.wrapper).toBe(`bash "${CACHE_SH}"`);
    expect(parsed.statusLine.command).toBe(`bash "${stablePath("buddy-statusline.sh")}"`);
  });

  test("same path in an unrelated property is left untouched", () => {
    const raw = [
      "{",
      `  "note": "backup of ${CACHE_SH}",`,
      '  "statusLine": {',
      '    "type": "command",',
      `    "command": "bash \\"${CACHE_SH}\\""`,
      "  }",
      "}",
    ].join("\n");
    writeFileSync(settingsPath(), raw);

    migrateLegacyStatuslineWiring();

    const after = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(after) as { note: string; statusLine: { command: string } };
    expect(parsed.note).toBe(`backup of ${CACHE_SH}`);
    expect(parsed.statusLine.command).toBe(`bash "${stablePath("buddy-statusline.sh")}"`);
  });

  test("settings file permission bits survive migration", () => {
    if (process.platform === "win32") {
      return;
    }

    writeFileSync(
      settingsPath(),
      `{"statusLine":{"type":"command","command":"bash \\"${CACHE_SH}\\""}}`,
      { mode: 0o600 },
    );

    migrateLegacyStatuslineWiring();

    const mode = statSync(settingsPath()).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(readFileSync(settingsPath(), "utf8")).toContain("plugins/buddy-onchain/buddy-statusline.sh");
  });

  test("foreign statusline is left untouched", () => {
    const raw = '{"statusLine":{"type":"command","command":"uv run my_statusline.py"}}';
    writeFileSync(settingsPath(), raw);

    migrateLegacyStatuslineWiring();

    expect(readFileSync(settingsPath(), "utf8")).toBe(raw);
  });

  test("repo dev wiring (non-cache path) is left untouched", () => {
    const raw =
      '{"statusLine":{"type":"command","command":"bash \\"/home/user/sources/repos/buddies-onchain/plugin/hooks/buddy-statusline.sh\\""}}';
    writeFileSync(settingsPath(), raw);

    migrateLegacyStatuslineWiring();

    expect(readFileSync(settingsPath(), "utf8")).toBe(raw);
  });

  test("missing settings file is a no-op", () => {
    expect(() => migrateLegacyStatuslineWiring()).not.toThrow();
    expect(existsSync(settingsPath())).toBe(false);
  });

  test("malformed settings JSON is left untouched", () => {
    writeFileSync(settingsPath(), "{ not json");

    migrateLegacyStatuslineWiring();

    expect(readFileSync(settingsPath(), "utf8")).toBe("{ not json");
  });
});

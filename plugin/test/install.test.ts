import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dir, "..", "hooks");
const INSTALL = join(HOOKS_DIR, "install.sh");
const UNINSTALL = join(HOOKS_DIR, "uninstall.sh");
const STATUSLINE = realpathSync(join(HOOKS_DIR, "buddy-statusline.sh"));

const tmpDirs: string[] = [];

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buddy-install-"));
  tmpDirs.push(root);
  return root;
}

function settingsPath(root: string): string {
  return join(root, "settings.json");
}

function readSettings(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsPath(root), "utf8")) as Record<string, unknown>;
}

async function runScript(
  script: string,
  root: string,
  args: string[] = [],
): Promise<RunResult> {
  const proc = Bun.spawn(["sh", script, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: root,
      CLAUDE_CONFIG_DIR: root,
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  return { exitCode: proc.exitCode, stdout, stderr };
}

function statusLineCommand(settings: Record<string, unknown>): string {
  const statusLine = settings.statusLine as { command?: unknown } | undefined;
  return typeof statusLine?.command === "string" ? statusLine.command : "";
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("install.sh", () => {
  test("fresh settings.json writes absolute buddy statusline path", async () => {
    const root = freshRoot();
    writeFileSync(settingsPath(root), JSON.stringify({ model: "sonnet" }));

    const result = await runScript(INSTALL, root);
    const settings = readSettings(root);
    const command = statusLineCommand(settings);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(settings.model).toBe("sonnet");
    expect(command).toBe(`bash "${STATUSLINE}"`);
    expect(command).not.toContain("$" + "{CLAUDE_PLUGIN_ROOT}");
  });

  test("missing settings.json creates a new file with statusLine", async () => {
    const root = freshRoot();

    const result = await runScript(INSTALL, root);
    const command = statusLineCommand(readSettings(root));

    expect(result.exitCode).toBe(0);
    expect(command).toBe(`bash "${STATUSLINE}"`);
  });

  test("empty object settings writes statusLine field", async () => {
    const root = freshRoot();
    writeFileSync(settingsPath(root), "{}");

    const result = await runScript(INSTALL, root);
    const command = statusLineCommand(readSettings(root));

    expect(result.exitCode).toBe(0);
    expect(command).toBe(`bash "${STATUSLINE}"`);
  });

  test("reinstall on already-installed statusline is an idempotent no-op", async () => {
    const root = freshRoot();

    await runScript(INSTALL, root);
    const before = readFileSync(settingsPath(root), "utf8");
    const result = await runScript(INSTALL, root);
    const after = readFileSync(settingsPath(root), "utf8");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("already installed");
    expect(after).toBe(before);
  });

  test("foreign statusline skips and warns without --force", async () => {
    const root = freshRoot();
    writeFileSync(
      settingsPath(root),
      JSON.stringify({ statusLine: { type: "command", command: "bash /custom.sh" } }),
    );

    const result = await runScript(INSTALL, root);
    const command = statusLineCommand(readSettings(root));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Foreign statusline detected");
    expect(result.stderr).toContain("pass --force to overwrite");
    expect(command).toBe("bash /custom.sh");
  });

  test("--force backs up settings.json then overwrites foreign statusline", async () => {
    const root = freshRoot();
    const foreign = {
      statusLine: { type: "command", command: "bash /custom.sh" },
      keep: true,
    };
    writeFileSync(settingsPath(root), JSON.stringify(foreign));

    const result = await runScript(INSTALL, root, ["--force"]);
    const settings = readSettings(root);
    const backup = JSON.parse(readFileSync(`${settingsPath(root)}.bak`, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(statusLineCommand(settings)).toBe(`bash "${STATUSLINE}"`);
    expect(settings.keep).toBe(true);
    expect(backup).toEqual(foreign);
  });

  test("symlinked settings.json is refused", async () => {
    if (process.platform === "win32") return;
    const root = freshRoot();
    const real = join(root, "real-settings.json");
    writeFileSync(real, JSON.stringify({}));
    symlinkSync(real, settingsPath(root));

    const result = await runScript(INSTALL, root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("symlinked");
  });

  test("oversize settings.json is refused", async () => {
    const root = freshRoot();
    writeFileSync(settingsPath(root), `{"pad":"${"x".repeat(70 * 1024)}"}`);

    const result = await runScript(INSTALL, root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("too large");
  });

  test("non-object root settings.json is refused", async () => {
    const root = freshRoot();
    writeFileSync(settingsPath(root), JSON.stringify(["not", "an", "object"]));

    const result = await runScript(INSTALL, root);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("must be a JSON object");
  });

  test("cross-platform reinstall rebinds buddy-managed .ps1 to .sh", async () => {
    const root = freshRoot();
    writeFileSync(
      settingsPath(root),
      JSON.stringify({
        statusLine: { type: "command", command: "powershell -File /win/buddy-statusline.ps1" },
      }),
    );

    const result = await runScript(INSTALL, root);
    const settings = readSettings(root);

    expect(result.exitCode).toBe(0);
    expect(statusLineCommand(settings)).toBe(`bash "${STATUSLINE}"`);
    expect(existsSync(`${settingsPath(root)}.bak`)).toBe(true);
  });
});

describe("uninstall.sh", () => {
  test("removes only a buddy-managed statusLine", async () => {
    const root = freshRoot();
    await runScript(INSTALL, root);

    const result = await runScript(UNINSTALL, root);
    const settings = readSettings(root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("removed");
    expect(Object.hasOwn(settings, "statusLine")).toBe(false);
  });

  test("leaves foreign statusLine alone", async () => {
    const root = freshRoot();
    const foreign = { statusLine: { type: "command", command: "bash /custom.sh" } };
    writeFileSync(settingsPath(root), JSON.stringify(foreign));

    const result = await runScript(UNINSTALL, root);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("not installed");
    expect(readSettings(root)).toEqual(foreign);
    expect(existsSync(`${settingsPath(root)}.bak`)).toBe(false);
  });
});

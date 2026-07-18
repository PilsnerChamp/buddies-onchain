import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function pluginDataDir(): string {
  return join(claudeDir(), "plugins", "buddy-onchain");
}

export function buddyStatePath(): string {
  return join(pluginDataDir(), ".buddy-state");
}

// Touched by buddy-statusline.{sh,ps1} on every render (and by documented
// inline embeds — see hooks/README.md § Custom statusline). The file's
// existence is the plugin's only evidence the badge participates in the
// live status bar; the rendered bar itself is TUI chrome no hook can read
// back.
//
// Two heartbeats per render: the global file answers "has the badge ever
// rendered on this machine?", the per-project file answers "has it rendered
// in THIS project?" — a project-level statusline can shadow the user-level
// one, so the global file alone cannot vouch for the current project.
export function badgeHeartbeatPath(): string {
  return join(pluginDataDir(), ".badge-heartbeat");
}

// Same 16-hex project key as `ambientStatePath` — the statusline scripts
// mirror this derivation (sha256 of the project dir, first 16 hex chars),
// so both sides must hash the identical directory string.
export function projectBadgeHeartbeatPath(projectDir: string): string {
  return join(
    pluginDataDir(),
    "projects",
    projectKey(projectDir),
    ".badge-heartbeat",
  );
}

// `import.meta.url` resolves to runtime location of the running module —
// `plugin/dist/index.js` when bundled and `plugin/src/plugin-paths.ts` when
// run from source. Both ascend to `plugin/`, descending to `hooks/` lands at
// the platform's statusline script. Avoid `__dirname`: bun build inlines
// it as the absolute build-machine source path, leaking dev environment
// AND breaking runtime resolution on installed plugins.
const HERE = dirname(fileURLToPath(import.meta.url));

export function statuslineScriptPath(): string {
  // Platform-matched: a Windows user told to wire the `.sh` script gets a
  // hint they cannot follow.
  const script =
    process.platform === "win32"
      ? "buddy-statusline.ps1"
      : "buddy-statusline.sh";
  return resolve(HERE, "..", "hooks", script);
}

// Full settings.json `statusLine.command` value for the platform script —
// the interpreter must match statuslineScriptPath(): `.ps1` under bash (or
// `.sh` under powershell) wires a command that never renders.
export function statuslineCommand(): string {
  const script = statuslineScriptPath();
  return process.platform === "win32"
    ? `powershell -ExecutionPolicy Bypass -File "${script}"`
    : `bash "${script}"`;
}

export function buddyArtCachePath(): string {
  return join(pluginDataDir(), ".buddy-art-cache.json");
}

function projectKey(projectDir: string): string {
  return createHash("sha256").update(projectDir).digest("hex").slice(0, 16);
}

export function ambientStatePath(
  projectDir: string,
  accountUuid: string,
  chainId: number,
): string {
  return join(
    pluginDataDir(),
    "projects",
    projectKey(projectDir),
    accountUuid,
    String(chainId),
    "state.json",
  );
}

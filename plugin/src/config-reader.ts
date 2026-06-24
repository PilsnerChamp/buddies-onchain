/**
 * Cross-platform reader for ~/.claude.json account identity.
 *
 * Handles Linux, macOS, Windows, and WSL2 (tries both Linux home
 * and the Windows %USERPROFILE% mount).
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------- types ----------------------------------------------------------

export interface OAuthAccount {
  accountUuid: string;
  [key: string]: unknown; // other fields we don't depend on
}

export interface ClaudeConfig {
  oauthAccount?: OAuthAccount;
  userID?: string;
  [key: string]: unknown;
}

// ---------- WSL detection --------------------------------------------------

let _isWsl: boolean | null = null;

async function isWsl(): Promise<boolean> {
  if (_isWsl !== null) return _isWsl;
  try {
    const procVersion = await readFile("/proc/version", "utf-8");
    _isWsl = /microsoft|wsl/i.test(procVersion);
  } catch {
    _isWsl = false;
  }
  return _isWsl;
}

/**
 * On WSL2 the Windows home directory is usually mounted under /mnt/c/Users/<name>.
 * We derive it from the WSLENV-exported USERPROFILE, or fall back to scanning
 * /mnt/c/Users for a directory containing .claude.json.
 */
async function wslWindowsHome(): Promise<string | null> {
  // Try the environment variable first (set when WSLENV passes USERPROFILE)
  const winProfile = process.env.USERPROFILE;
  if (winProfile) {
    // Convert C:\Users\foo to /mnt/c/Users/foo
    const converted = winProfile
      .replace(/^([A-Za-z]):/, (_m, drive: string) => `/mnt/${drive.toLowerCase()}`)
      .replace(/\\/g, "/");
    return converted;
  }

  // Fallback: probe common mount point
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir("/mnt/c/Users", { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "Public" || entry.name === "Default") continue;
      const candidate = join("/mnt/c/Users", entry.name);
      try {
        await readFile(join(candidate, ".claude.json"), "utf-8");
        return candidate;
      } catch {
        // not this user
      }
    }
  } catch {
    // /mnt/c/Users not mounted
  }
  return null;
}

// ---------- public API -----------------------------------------------------

/**
 * Return all candidate paths for .claude.json, ordered by preference.
 * On WSL2 we try the Linux home first, then the Windows-side home.
 */
async function configPaths(): Promise<string[]> {
  const paths: string[] = [];
  // Prefer the HOME/USERPROFILE env over os.homedir(): Bun's homedir() ignores
  // a runtime-mutated HOME, so tests that redirect config reads via process.env
  // (and any caller overriding HOME) only work if we read the env directly.
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  paths.push(join(home, ".claude.json"));

  if (await isWsl()) {
    const winHome = await wslWindowsHome();
    if (winHome) {
      paths.push(join(winHome, ".claude.json"));
    }
  }

  return paths;
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Read and parse .claude.json from the first path that exists.
 * Throws if no config is found at any candidate path.
 */
export async function readClaudeConfig(): Promise<{
  config: ClaudeConfig;
  path: string;
}> {
  const paths = await configPaths();
  const errors: string[] = [];

  for (const p of paths) {
    let raw: string;
    try {
      raw = await readFile(p, "utf-8");
    } catch (err) {
      errors.push(`${p}: ${(err as Error).message}`);
      if (isNotFoundError(err)) {
        continue;
      }
      throw new Error(
        `Could not read .claude.json from first existing candidate:\n${errors.join("\n")}`
      );
    }

    try {
      const config = JSON.parse(raw) as ClaudeConfig;
      return { config, path: p };
    } catch (err) {
      errors.push(`${p}: ${(err as Error).message}`);
      throw new Error(
        `Could not parse .claude.json from first existing candidate:\n${errors.join("\n")}`
      );
    }
  }

  throw new Error(
    `Could not read .claude.json from any candidate path:\n${errors.join("\n")}`
  );
}

/**
 * Extract the identity seed components from config.
 * Returns the accountUuid (preferred) or Claude's legacy identity fallback.
 * Callers that derive buddy identity must validate this as a v4 UUID before
 * hashing; fallback values mean "no hashable buddy identity".
 */
export function extractIdentity(config: ClaudeConfig): {
  accountUuid: string;
} {
  // Match Claude Code's identity fallback: oauthAccount.accountUuid → userID → "anon".
  // The fallback is never a hash input unless a caller has first validated it
  // as a v4 account UUID.
  const accountUuid = config.oauthAccount?.accountUuid ?? config.userID ?? "anon";
  return { accountUuid };
}

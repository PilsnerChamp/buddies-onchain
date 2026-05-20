import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function pluginDataDir(): string {
  return join(claudeDir(), "plugins", "buddy-onchain");
}

export function buddyStatePath(): string {
  return join(pluginDataDir(), ".buddy-state");
}

export function buddyArtCachePath(): string {
  return join(pluginDataDir(), ".buddy-art-cache.json");
}

export function settingsPath(): string {
  return join(claudeDir(), "settings.json");
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

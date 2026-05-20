// SessionStart hook orchestration.
//
// Boot stages:
//   1. Environment `off` short-circuits to OK before any state/RPC work.
//   2. Lookup refresh performs live chain resolution and state writeback.
//   3. Effective mode selects one ruleset body.
//   4. Missing statusline config appends a setup nudge.
//
// Hard contract: never log, exit, or throw past `runSessionStart`.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isValidUuid } from "~shared/isValidUuid";
import { defaultState, getEnvMode, readState, type ModeLevel } from "./buddy-state";
import { readClaudeConfig, extractIdentity } from "./config-reader";
import { deriveEffective } from "./effective-state";
import { RULESET_AMBIENT, STATUSLINE_NUDGE_TEMPLATE } from "./instructions";
import { resolveAndWriteBuddyChainState } from "./lookup-payload";
import { safeReadJson } from "./safe-json-store";
import { clearDriftFlag, consumeExpectedRender } from "./drift-flag";
import { settingsPath } from "./plugin-paths";
import { isPlainObject } from "./plain-object";

interface StatusLineProbe {
  hasStatusLine: boolean;
}

const MAX_SETTINGS_BYTES = 64 * 1024;

// `import.meta.url` resolves to runtime location of the running module —
// `plugin/dist/index.js` when bundled and `plugin/src/session-start.ts` when
// run from source. Both ascend to `plugin/`, descending to `hooks/` lands at
// `plugin/hooks/buddy-statusline.sh`. Avoid `__dirname`: bun build inlines
// it as the absolute build-machine source path, leaking dev environment
// AND breaking runtime resolution on installed plugins.
const HERE = dirname(fileURLToPath(import.meta.url));

function statuslineScriptPath(): string {
  return resolve(HERE, "..", "hooks", "buddy-statusline.sh");
}

function validateSettings(raw: unknown): StatusLineProbe | null {
  if (!isPlainObject(raw)) {
    return { hasStatusLine: false };
  }

  return { hasStatusLine: Object.hasOwn(raw, "statusLine") };
}

function statusLineConfigured(): boolean {
  const probe = safeReadJson(
    settingsPath(),
    validateSettings,
    MAX_SETTINGS_BYTES,
  );

  return probe?.hasStatusLine ?? false;
}

function withStatuslineNudge(ruleset: string): string {
  if (statusLineConfigured()) {
    return ruleset;
  }

  return [
    ruleset,
    STATUSLINE_NUDGE_TEMPLATE(statuslineScriptPath()),
  ].join("\n\n");
}

function rulesetForMode(mode: ModeLevel): string {
  switch (mode) {
    case "off":
      return "OK";
    case "lite":
    case "full":
      return RULESET_AMBIENT;
    default: {
      const exhaustive: never = mode;
      throw new Error(`unhandled mode: ${String(exhaustive)}`);
    }
  }
}

function emit(text: string): void {
  process.stdout.write(`${text}\n`);
}

async function readSessionAccountUuid(): Promise<string | null> {
  try {
    const { config } = await readClaudeConfig();
    const accountUuid = extractIdentity(config).accountUuid;
    if (typeof accountUuid !== "string") return null;

    const canonicalUuid = accountUuid.trim().toLowerCase();
    return isValidUuid(canonicalUuid) ? canonicalUuid : null;
  } catch {
    return null;
  }
}

export async function runSessionStart(): Promise<void> {
  try {
    try {
      clearDriftFlag();
    } catch {
      // Stale recovery flags must never break session boot.
    }
    try {
      consumeExpectedRender();
    } catch {
      // Stale recovery flags must never break session boot.
    }

    if (getEnvMode() === "off") {
      emit("OK");
      return;
    }

    const accountUuid = await readSessionAccountUuid();
    if (accountUuid === null) {
      emit("OK");
      return;
    }

    let resolved: Awaited<ReturnType<typeof resolveAndWriteBuddyChainState>>;
    try {
      resolved = await resolveAndWriteBuddyChainState({
        accountUuid,
        context: "session-start",
      });
    } catch {
      const persistedMode = readState()?.mode ?? defaultState().mode;
      const mode = getEnvMode() ?? persistedMode;
      emit(withStatuslineNudge(rulesetForMode(mode)));
      return;
    }

    const effective = deriveEffective(
      resolved.state,
      resolved.identity,
      getEnvMode(),
    );

    emit(withStatuslineNudge(rulesetForMode(effective.effectiveMode)));
  } catch {
    emit("OK");
  }
}

// SessionStart hook orchestration.
//
// Boot stages:
//   1. Environment `off` short-circuits to OK before any state/RPC work.
//   2. Lookup refresh performs live chain resolution and state writeback.
//   3. Effective mode selects one ruleset body.
//   4. Warm buddy with a missing/mismatched art cache rebuilds it (bounded
//      tokenURI fetch) so ambient recovers without a manual slash.
//   5. No badge heartbeat (project or global) appends a setup nudge.
//
// Hard contract: never log, exit, or throw past `runSessionStart`.

import { isValidUuid } from "./isValidUuid";
import { defaultState, getEnvMode, readState, type ModeLevel } from "./buddy-state";
import { readClaudeConfig, extractIdentity } from "./config-reader";
import { deriveEffective } from "./effective-state";
import { RULESET_AMBIENT, STATUSLINE_NUDGE_TEMPLATE } from "./instructions";
import {
  ensureWarmArtCache,
  resolveAndWriteBuddyChainState,
} from "./lookup-payload";
import {
  hasGlobalBadgeHeartbeat,
  hasProjectBadgeHeartbeat,
} from "./badge-heartbeat";
import {
  clearDriftFlag,
  consumeExpectedRender,
  consumeSessionFresh,
  setSessionFresh,
} from "./drift-flag";
import { statuslineCommand } from "./plugin-paths";

// tokenURI rebuild gets its own sub-budget inside the 5s hook timeout —
// better to boot without the buddy than let a slow RPC stall session start.
const ART_CACHE_REBUILD_TIMEOUT_MS = 2000;

// Nudge on badge-heartbeat evidence, not settings.json contents — a
// `statusLine` key proves nothing (a project-level settings file can shadow
// it, and a foreign statusline satisfies the probe without rendering the
// badge). Project heartbeat present → the badge has rendered here, done.
// Otherwise the global heartbeat gates the nudge: SessionStart can race the
// first statusline render, and a brand-new project has no project heartbeat
// yet, so a badge that provably rendered elsewhere on this machine stays
// quiet here — the slash lookup's per-project wire hint covers the
// shadowed-project case precisely.
function statuslineNudgeNeeded(): boolean {
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  return (
    !hasProjectBadgeHeartbeat(projectDir) && !hasGlobalBadgeHeartbeat()
  );
}

function withStatuslineNudge(ruleset: string): string {
  try {
    if (!statuslineNudgeNeeded()) {
      return ruleset;
    }
  } catch {
    // Undeterminable badge status stays silent — never nag on uncertainty.
    return ruleset;
  }

  return [
    ruleset,
    STATUSLINE_NUDGE_TEMPLATE(statuslineCommand()),
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

function emitRulesetForMode(mode: ModeLevel): void {
  const text = withStatuslineNudge(rulesetForMode(mode));
  if (mode === "lite" || mode === "full") {
    try {
      setSessionFresh();
    } catch {
      // Session-fresh marking is best-effort; session boot must still emit.
    }
  }
  emit(text);
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
    try {
      consumeSessionFresh();
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
      emitRulesetForMode(mode);
      return;
    }

    const effective = deriveEffective(
      resolved.state,
      resolved.identity,
      getEnvMode(),
    );

    if (effective.effectiveMode !== "off") {
      // Heal a cleared/mismatched warm art cache (identity rotation) so
      // ambient turns render without a manual `/buddy-onchain`. Bounded well
      // under the 5s SessionStart hook budget, which the chain-state resolve
      // above already spends from; soft-fails to the old degraded behavior.
      await ensureWarmArtCache({
        state: resolved.state,
        identity: resolved.identity,
        timeoutMs: ART_CACHE_REBUILD_TIMEOUT_MS,
      });
    }

    emitRulesetForMode(effective.effectiveMode);
  } catch {
    emit("OK");
  }
}

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pluginDataDir } from "./plugin-paths";

const EXPECTED_RENDER_FLAG = "expected-render.flag";
const DRIFT_FLAG = "repeat-buddy-instructions.flag";
// Set by SessionStart when it emits RULESET_AMBIENT; consumed (cleared) by the
// first UserPromptSubmit of the session. Lets the first slash lookup guard its
// card against the freshly-injected ambient ruleset while later lookups stay
// guard-free. See `src/instructions.ts` RENDER_VERBATIM_GUARD.
const SESSION_FRESH_FLAG = "session-fresh.flag";

export function expectedRenderFlagPath(): string {
  return join(pluginDataDir(), EXPECTED_RENDER_FLAG);
}

export function driftFlagPath(): string {
  return join(pluginDataDir(), DRIFT_FLAG);
}

export function sessionFreshFlagPath(): string {
  return join(pluginDataDir(), SESSION_FRESH_FLAG);
}

function touchFlag(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "");
  } catch {
    // Flag writes are best-effort; hooks must never break the prompt path.
  }
}

function clearFlag(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Missing/unwritable flags are benign for this soft recovery loop.
  }
}

export function setExpectedRender(): void {
  touchFlag(expectedRenderFlagPath());
}

export function consumeExpectedRender(): boolean {
  const path = expectedRenderFlagPath();
  let existed = false;
  try {
    existed = existsSync(path);
  } catch {
    return false;
  }

  if (existed) {
    clearFlag(path);
  }

  return existed;
}

export function setSessionFresh(): void {
  touchFlag(sessionFreshFlagPath());
}

export function consumeSessionFresh(): boolean {
  const path = sessionFreshFlagPath();
  let existed = false;
  try {
    existed = existsSync(path);
  } catch {
    return false;
  }

  if (existed) {
    clearFlag(path);
  }

  return existed;
}

export function setDriftFlag(): void {
  touchFlag(driftFlagPath());
}

export function clearDriftFlag(): void {
  clearFlag(driftFlagPath());
}

export function isDriftFlagSet(): boolean {
  try {
    return existsSync(driftFlagPath());
  } catch {
    return false;
  }
}

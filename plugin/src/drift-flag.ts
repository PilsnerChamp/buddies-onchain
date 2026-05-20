import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pluginDataDir } from "./plugin-paths";

const EXPECTED_RENDER_FLAG = "expected-render.flag";
const DRIFT_FLAG = "repeat-buddy-instructions.flag";

export function expectedRenderFlagPath(): string {
  return join(pluginDataDir(), EXPECTED_RENDER_FLAG);
}

export function driftFlagPath(): string {
  return join(pluginDataDir(), DRIFT_FLAG);
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

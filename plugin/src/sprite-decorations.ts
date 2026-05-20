// State-driven sprite row decorators.
//
// These run after row resolution and before `buildAdditionalContext` in the
// ambient pipeline, and are also used by slash-card cold bodies. Pure only:
// no I/O, no state mutation.

import type { BuddyStateV4 } from "./buddy-state";
import type { EffectiveState } from "./effective-state";

export const SLEEP_INDICATOR_ROW = "      ZZzzz...   ";
export const COLD_NUDGE_LINE_1 = "your buddy is sleeping";
export const COLD_NUDGE_LINE_2 = "hatch it onchain";

export interface ColdNudgeResult {
  rows: string[];
  jokeOverrides: (string | null)[];
}

export function applySleepIndicator(
  rows: string[],
  state: BuddyStateV4,
  effective: EffectiveState,
): string[] {
  if (effective.reason !== "ok") return rows;
  if (state.hatch !== "cold") return rows;
  if (rows.length === 0) return rows;

  const out = [...rows];
  out[0] = SLEEP_INDICATOR_ROW;
  return out;
}

export function applyColdNudge(
  rows: string[],
  fire: boolean,
  hatchUrl: string,
): ColdNudgeResult {
  if (!fire || rows.length === 0) {
    return { rows, jokeOverrides: rows.map(() => null) };
  }

  const jokeOverrides = rows.map((_, i) => {
    if (i === 0) return COLD_NUDGE_LINE_1;
    if (i === 1) return COLD_NUDGE_LINE_2;
    if (i === 2) return hatchUrl;
    return null;
  });

  return { rows, jokeOverrides };
}

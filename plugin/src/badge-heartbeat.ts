// Statusline badge heartbeat check.
//
// buddy-statusline.{sh,ps1} (and documented inline embeds) touch
// `badgeHeartbeatPath()` on every render. Claude Code re-runs the effective
// statusline command continuously while a session is open, so a wired badge
// keeps the mtime fresh. A stale/missing heartbeat at slash-lookup time means
// the badge is not rendering — no statusline at all, or a foreign/project
// statusline that shadows it.
//
// Soft-fail discipline: only a *certain* miss (ENOENT, stale mtime, or a
// symlinked/non-regular heartbeat the scripts refuse to touch) reports
// unwired; any other fs error reports wired so the lookup card never nags on
// uncertainty.

import { lstatSync } from "node:fs";
import { badgeHeartbeatPath } from "./plugin-paths";

// Statusline re-renders many times a minute during an active session, and at
// least once at TUI boot before the first prompt can be submitted. Ten
// minutes tolerates idle gaps without letting a heartbeat from a long-dead
// wiring pass as live.
export const HEARTBEAT_MAX_AGE_MS = 10 * 60 * 1000;

export function isBadgeHeartbeatFresh(
  nowMs: number = Date.now(),
  maxAgeMs: number = HEARTBEAT_MAX_AGE_MS,
): boolean {
  try {
    // lstat, never stat: the writer scripts refuse symlinked heartbeats, so
    // the reader must not follow one either — a symlink to a fresh file
    // would suppress the warning on a wiring that cannot be touching it.
    const stats = lstatSync(badgeHeartbeatPath());
    if (!stats.isFile()) {
      return false;
    }
    return nowMs - stats.mtimeMs <= maxAgeMs;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code !== "ENOENT";
  }
}

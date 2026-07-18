// Statusline badge heartbeat check.
//
// buddy-statusline.{sh,ps1} (and documented inline embeds) touch two
// heartbeat files on every render: the global `badgeHeartbeatPath()` and the
// per-project `projectBadgeHeartbeatPath(projectDir)` (project dir taken
// from the statusline stdin payload).
//
// The per-project file is the precise signal: a missing project heartbeat
// means the badge has never rendered in THIS project — no statusline at
// all, or a foreign/project statusline that shadows it — even while a
// session in another project keeps its own heartbeat. The global file is
// the coarse "wired somewhere on this machine" signal; SessionStart uses it
// to avoid nagging on the first-ever boot in a new project before the
// statusline loop has produced a project heartbeat.
//
// Existence, not mtime: statusline renders are event-driven — nothing
// re-renders during an idle gap — so a stale mtime proves nothing about
// wiring (an 11-minute lull would read as "unwired"). Only a file the
// writer scripts have never created is a certain miss. Trade-off: removing
// a once-wired statusline leaves the heartbeat behind, so that project is
// never re-nagged. Accepted — false nags after every ordinary idle gap
// cost more than a missed nag after deliberate unwiring.
//
// Soft-fail discipline: only a *certain* miss (ENOENT, or a symlinked/
// non-regular heartbeat the scripts refuse to touch) reports unwired; any
// other fs error reports wired so callers never nag on uncertainty.

import { lstatSync } from "node:fs";
import { badgeHeartbeatPath, projectBadgeHeartbeatPath } from "./plugin-paths";

function heartbeatExists(path: string): boolean {
  try {
    // lstat, never stat: the writer scripts refuse symlinked heartbeats, so
    // the reader must not follow one either — a symlink to a real file
    // would suppress the warning on a wiring that cannot be touching it.
    return lstatSync(path).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code !== "ENOENT";
  }
}

export function hasProjectBadgeHeartbeat(projectDir: string): boolean {
  return heartbeatExists(projectBadgeHeartbeatPath(projectDir));
}

export function hasGlobalBadgeHeartbeat(): boolean {
  return heartbeatExists(badgeHeartbeatPath());
}

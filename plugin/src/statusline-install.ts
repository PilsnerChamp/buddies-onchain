// Version-stable statusline script install + legacy-wiring migration.
//
// Marketplace plugin installs live under a VERSION-PINNED cache dir
// (`cache/<marketplace>/<plugin>/<version>/`), so wiring settings.json (or a
// custom-statusline embed) to the bundled script path breaks on every plugin
// update — the old version dir goes stale or disappears. Instead SessionStart
// and the slash lookup refresh a copy of both statusline scripts into the
// plugin data dir (`installedStatuslineScriptPath`), which never moves;
// user-facing wiring references only that copy, and plugin updates propagate
// to it on the next boot or slash.
//
// Ownership: a `.statusline-scripts-version` sidecar records which plugin
// version wrote the copies. A refresh is skipped when the sidecar belongs to
// a NEWER plugin — a still-running old session (hot-loaded hooks) must not
// downgrade the copy the freshly-updated install just wrote.
//
// Atomic replace (exclusive-create tmp + rename): the live statusline loop
// may execute the script at any moment, and `bash` reading a half-written
// file would spray parse errors into the status bar. The tmp name carries a
// random suffix and is opened with `wx` so a pre-planted file or symlink at
// the tmp path fails the write instead of being followed/clobbered.
//
// Soft-fail per script: a failed copy leaves the previous copy (or nothing)
// in place — boot must never break over a decorative badge.

import { randomBytes } from "node:crypto";
import {
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import {
  bundledStatuslineScriptPath,
  claudeDir,
  installedStatuslineScriptPath,
  pluginDataDir,
  pluginPackageJsonPath,
  STATUSLINE_SCRIPTS,
} from "./plugin-paths";

// Bundled scripts are a few KiB; anything near this bound is not our file.
const MAX_SCRIPT_BYTES = 256 * 1024;
const MAX_SETTINGS_BYTES = 64 * 1024;

function versionSidecarPath(): string {
  return join(pluginDataDir(), ".statusline-scripts-version");
}

function readBounded(path: string): Buffer | null {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.size > MAX_SCRIPT_BYTES) {
    return null;
  }
  return readFileSync(path);
}

// [major, minor, patch] or null. Tolerates missing/garbage input — version
// gating simply disengages and content-compare alone decides.
function parseVersion(raw: unknown): number[] | null {
  if (typeof raw !== "string") return null;
  const parts = raw.trim().split(".");
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function ownVersion(): number[] | null {
  try {
    const raw = readBounded(pluginPackageJsonPath());
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (parsed === null || typeof parsed !== "object") return null;
    return parseVersion((parsed as { version?: unknown }).version);
  } catch {
    return null;
  }
}

function sidecarVersion(): number[] | null {
  try {
    const raw = readBounded(versionSidecarPath());
    if (raw === null) return null;
    return parseVersion(raw.toString("utf8"));
  } catch {
    return null;
  }
}

// Exclusive-create tmp + rename. `wx` fails on any pre-existing tmp path —
// including a dangling symlink — so nothing foreign is followed or clobbered.
// `mode` (when given) is applied at tmp creation so the rename never widens
// the destination's POSIX permissions; Windows ACLs are outside Node's reach
// and follow the directory default.
function atomicWrite(
  dest: string,
  content: Buffer | string,
  mode?: number,
): void {
  const tmp = `${dest}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(tmp, content, mode === undefined ? { flag: "wx" } : { flag: "wx", mode });
    renameSync(tmp, dest);
  } catch (error) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Leftover tmp is inert; never fail boot over cleanup.
    }
    throw error;
  }
}

// Writer lock for the scripts+sidecar transaction. The version-sidecar guard
// alone cannot stop OVERLAPPING writers (both read the old sidecar, both
// pass, the older one finishes last); the guard must be re-read under the
// same lock that covers the writes. Exclusive-create lockfile carrying a
// random ownership token; release removes the lock only when the token still
// matches, so a holder never deletes a lock it lost. Losing the lock skips
// this refresh — whoever holds it does the same work.
//
// Stale takeover (holder died > LOCK_STALE_MS ago) must itself be
// serialized: a naive check-then-remove lets two stealers leapfrog — both
// observe the stale lock, one steals and recreates, the delayed other then
// removes the WINNER'S fresh lock. The claim protocol closes that:
//   1. lstat the lock; bail unless it is a stale regular file (snapshot ino).
//   2. linkSync(lock, claim) where the claim name embeds the snapshot's
//      inode+mtime — hard-link creation is atomic and fails EEXIST, so per
//      stale-lock-instance exactly one claimant wins; the link never moves
//      or alters the lock itself.
//   3. Re-lstat the claim: its inode is whatever the lock pointed at during
//      step 2. Mismatch with the snapshot = the lock was already replaced
//      by a fresh holder between 1 and 2 → drop the claim, back off, fresh
//      lock untouched.
//   4. Match = the stale inode is still the lock, and every other stealer
//      is EEXIST-blocked on the claim while fresh acquirers are blocked by
//      the lock's existence — removing lock+claim and recreating via `wx`
//      races only other fresh acquirers, where `wx` has one winner.
// Filesystems without hard links (exotic for ~/.claude) fail step 2 → no
// takeover; the stale lock then parks the refresh, nothing corrupts.
//
// RESIDUAL WINDOW, accepted deliberately: pathname locks on bare POSIX
// primitives cannot achieve perfect ownership (that requires flock/held-fd
// semantics — a native dependency this decorative plugin does not warrant).
// Overlap still needs a holder suspended >LOCK_STALE_MS inside a
// milliseconds-long transaction resuming at the exact moment of a takeover,
// or a rival clearing dead-claim litter in the same microsecond window.
// The protected writes are individually atomic (tmp+rename — never torn)
// and idempotent, so the worst outcome of an overlap is a transiently old
// script copy that the next SessionStart refresh converges; the settings
// migration does not rely on this lock at all.
const LOCK_STALE_MS = 60 * 1000;

function lockPath(): string {
  return join(pluginDataDir(), ".statusline-scripts.lock");
}

function acquireScriptsLock(): string | null {
  const lock = lockPath();
  const token = randomBytes(12).toString("hex");
  try {
    mkdirSync(pluginDataDir(), { recursive: true });
    writeFileSync(lock, token, { flag: "wx" });
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") return null;
  }
  try {
    const snapshot = lstatSync(lock);
    if (!snapshot.isFile() || Date.now() - snapshot.mtimeMs <= LOCK_STALE_MS) {
      return null;
    }
    const claim = `${lock}.claim-${snapshot.ino}-${Math.floor(snapshot.mtimeMs)}`;
    try {
      linkSync(lock, claim);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        // No hard links on this filesystem → no takeover, nothing corrupts.
        return null;
      }
      // EEXIST: a rival claimant — either live (finishes in milliseconds)
      // or dead litter that would park takeover forever. mtime cannot tell
      // them apart (the link shares the stale inode's mtime), but ctime is
      // bumped by link creation itself: a fresh ctime = live rival, back
      // off; a stale ctime = the claimant died mid-takeover, clear the
      // litter and retry the link once (relink still has one winner).
      try {
        const claimStats = lstatSync(claim);
        if (Date.now() - claimStats.ctimeMs <= LOCK_STALE_MS) return null;
        rmSync(claim, { force: true });
        linkSync(lock, claim);
      } catch {
        return null;
      }
    }
    try {
      if (lstatSync(claim).ino !== snapshot.ino) {
        // The lock was replaced by a live holder between snapshot and claim.
        return null;
      }
      rmSync(lock, { force: true });
    } finally {
      rmSync(claim, { force: true });
    }
    // Old claim litter from claimants that died mid-takeover: those claims
    // link dead stale inodes and can never match a future snapshot, so they
    // only waste directory entries — sweep opportunistically while we are
    // the sole stealer.
    try {
      for (const entry of readdirSync(pluginDataDir())) {
        if (entry.startsWith(".statusline-scripts.lock.claim-") && entry !== basename(claim)) {
          rmSync(join(pluginDataDir(), entry), { force: true });
        }
      }
    } catch {
      // Litter is inert; never fail acquisition over cleanup.
    }
    // Recreate races only other FRESH acquirers now; `wx` has one winner.
    writeFileSync(lock, token, { flag: "wx" });
    return token;
  } catch {
    return null;
  }
}

function releaseScriptsLock(token: string): void {
  try {
    const lock = lockPath();
    const stats = lstatSync(lock);
    if (!stats.isFile() || stats.size > 4096) return;
    if (readFileSync(lock, "utf8") === token) {
      rmSync(lock, { force: true });
    }
  } catch {
    // A stuck lock self-heals via the staleness steal.
  }
}

export function ensureInstalledStatuslineScripts(): void {
  const lockToken = acquireScriptsLock();
  if (lockToken === null) return;
  try {
    const mine = ownVersion();
    try {
      const installed = sidecarVersion();
      if (mine !== null && installed !== null && compareVersions(installed, mine) > 0) {
        // A newer plugin owns the stable copies; a stale hot-loaded session
        // must not downgrade them.
        return;
      }
    } catch {
      // Undeterminable ownership → fall through; content compare decides.
    }

    let wroteAny = false;
    for (const name of STATUSLINE_SCRIPTS) {
      try {
        const sourcePath = bundledStatuslineScriptPath(name);
        const source = readBounded(sourcePath);
        if (source === null) continue;

        const dest = installedStatuslineScriptPath(name);
        try {
          const existing = readBounded(dest);
          if (existing !== null && existing.equals(source)) continue;
          if (existing === null) continue; // symlink/oversized dest: refuse
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") continue;
        }

        atomicWrite(dest, source, lstatSync(sourcePath).mode & 0o777);
        wroteAny = true;
      } catch {
        // Per-script soft-fail; the other script still gets its refresh.
      }
    }

    if (wroteAny && mine !== null) {
      try {
        atomicWrite(versionSidecarPath(), mine.join("."));
      } catch {
        // Missing sidecar only disengages the downgrade guard.
      }
    }
  } finally {
    releaseScriptsLock(lockToken);
  }
}

// Legacy-wiring migration: v1.1.0–v1.2.0 nudges wired settings.json to the
// bundled script inside the marketplace cache — a version-pinned path that
// dies on update, silently (existence-only heartbeats keep suppressing the
// nag). Rewrite ONLY that exact buddy-recognizable shape to the stable copy;
// any other statusline command is foreign and stays untouched (see
// hooks/README.md "Why we don't auto-merge"). The rewrite is a raw-text
// substring replacement of just the path, preserving the user's file
// formatting; atomic tmp+rename write.
// Leftmost match starts right after the command's opening quote (quotes are
// excluded from every class), so match[0] is the full absolute script path —
// backslashes allowed throughout for Windows paths.
const LEGACY_CACHE_SCRIPT_RE =
  /[^"]*[\\/]cache[\\/][^"]*buddy-onchain[^"]*[\\/]hooks[\\/]buddy-statusline\.(sh|ps1)/;

export function migrateLegacyStatuslineWiring(): void {
  try {
    const settingsPath = join(claudeDir(), "settings.json");
    const stats = lstatSync(settingsPath);
    if (!stats.isFile() || stats.size > MAX_SETTINGS_BYTES) return;

    const rawText = readFileSync(settingsPath, "utf8");
    const parsed: unknown = JSON.parse(rawText);
    if (parsed === null || typeof parsed !== "object") return;
    const statusLine = (parsed as { statusLine?: unknown }).statusLine;
    if (statusLine === null || typeof statusLine !== "object") return;
    const command = (statusLine as { command?: unknown }).command;
    if (typeof command !== "string") return;

    const match = LEGACY_CACHE_SCRIPT_RE.exec(command);
    if (match === null) return;

    const legacyPath = match[0];
    const flavor = match[1] === "ps1" ? "buddy-statusline.ps1" : "buddy-statusline.sh";
    const stablePath = installedStatuslineScriptPath(flavor);

    // Replace the path ONLY inside statusLine.command, not file-wide — the
    // same path (or even the identical full command string) in an unrelated
    // property must stay untouched. Try each raw-text occurrence of the
    // command's JSON-escaped form and keep the splice whose REPARSE proves
    // it changed statusLine.command (an occurrence belonging to some other
    // property leaves statusLine.command unchanged and fails the check). If
    // the file escapes the value differently than JSON.stringify (e.g. \u
    // sequences), every lookup misses and migration waits — old wiring
    // keeps working meanwhile.
    const escapedCommand = JSON.stringify(command).slice(1, -1);
    const escapedLegacy = JSON.stringify(legacyPath).slice(1, -1);
    const escapedStable = JSON.stringify(stablePath).slice(1, -1);
    if (!escapedCommand.includes(escapedLegacy)) return;

    const rewrittenCommand = escapedCommand.replace(escapedLegacy, escapedStable);
    const expectedCommand = command.replace(legacyPath, stablePath);

    for (
      let idx = rawText.indexOf(escapedCommand);
      idx !== -1;
      idx = rawText.indexOf(escapedCommand, idx + 1)
    ) {
      const candidate =
        rawText.slice(0, idx) +
        rewrittenCommand +
        rawText.slice(idx + escapedCommand.length);
      try {
        const reparsed: unknown = JSON.parse(candidate);
        const line = (reparsed as { statusLine?: { command?: unknown } }).statusLine;
        if (line?.command !== expectedCommand) continue;
      } catch {
        continue;
      }

      // Preserve the settings file's own permission bits — a 0600 config
      // must not come back 0644 after migration.
      atomicWrite(settingsPath, candidate, stats.mode & 0o777);
      return;
    }
  } catch {
    // Migration is best-effort: worst case the old wiring keeps working
    // until the cache dir disappears, same as before this existed.
  }
}

// plugin/src/ambient.ts
//
// Ambient buddy injection: thin UserPromptSubmit payload.
//
// SessionStart carries the heavy ruleset. This module only rotates a cached
// sprite frame and emits the `DISPLAY_BUDDY` anchor plus a fenced block.
// Ambient turns never perform chain RPC; missing or stale cache degrades to
// `{}` at the hook layer. All file reads/writes use safe-json-store so corrupt
// or symlinked cursor files fail closed without touching the user's prompt path.
//
// Emit shape (`buildAdditionalContext` return value, before the hook wraps it
// in `additionalContext`):
//
//   DISPLAY_BUDDY [render block top of reply; fill jokes right of |]
//
//   ```
//     .[||].  |
//    [ -  - ] |
//    [ ==== ] |
//    `------´ |
//   ```
//
// Directive line + blank line + fenced block. Each sprite row left-padded one
// space, right-padded to common width, trailed by ` | ` for the joke column.
// No language tag on the fence. The model fills jokes right of every `|`.

import { FRAME_IDS, type FrameId } from './sprite';
import type { PluginNetworkInfo } from './network';
import { readIdentityTuple } from './buddy-state';
import { cacheMatchesIdentityAndToken, readArtCache } from './art-cache';
import { safeReadJson, safeWriteJson } from './safe-json-store';
import { ambientStatePath } from './plugin-paths';
import { isPlainObject } from './plain-object';

export interface AmbientState {
  /** Index into FRAME_IDS of the frame shown LAST. Next call rotates +1. */
  lastFrameIndex: number;
  /** Account UUID this state was captured for — invalidate on change. */
  accountUuid: string | null;
  /** Chain id this state was captured for — invalidate on change. */
  chainId: number | null;
}

const STATE_VERSION = 1;
const MAX_STATE_BYTES = 4 * 1024;
const DISPLAY_BUDDY_DIRECTIVE =
  'DISPLAY_BUDDY [render block top of reply; fill jokes right of |]';
const COLD_NUDGE_DIRECTIVE =
  'COLD_NUDGE [pre-filled joke cells take precedence over the joke voice rules for those rows; render them verbatim or paraphrase lightly but keep the URL intact and the meaning of each line stable; only fill the blank cells per the joke voice instructions]';

export interface BuildOptions {
  jokeOverrides?: (string | null)[];
  coldNudgeActive?: boolean;
}

interface AmbientStateFile extends AmbientState {
  version: typeof STATE_VERSION;
}

function freshState(): AmbientState {
  return { lastFrameIndex: -1, accountUuid: null, chainId: null };
}

function validateStateFile(raw: unknown): AmbientStateFile | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  if (raw.version !== STATE_VERSION) {
    return null;
  }

  if (!Number.isInteger(raw.lastFrameIndex)) {
    return null;
  }

  if (raw.accountUuid !== null && typeof raw.accountUuid !== 'string') {
    return null;
  }

  if (raw.chainId !== null && !Number.isInteger(raw.chainId)) {
    return null;
  }

  return {
    version: STATE_VERSION,
    lastFrameIndex: raw.lastFrameIndex as number,
    accountUuid: raw.accountUuid as string | null,
    chainId: raw.chainId as number | null,
  };
}

export function stateFilePath(
  projectDir: string,
  accountUuid: string,
  chainId: number,
): string {
  return ambientStatePath(projectDir, accountUuid, chainId);
}

export function readState(path: string): AmbientState {
  const file = safeReadJson(path, validateStateFile, MAX_STATE_BYTES);
  if (file === null) {
    return freshState();
  }

  return {
    lastFrameIndex: file.lastFrameIndex,
    accountUuid: file.accountUuid,
    chainId: file.chainId,
  };
}

export function writeState(path: string, state: AmbientState): void {
  safeWriteJson(path, { version: STATE_VERSION, ...state }, validateStateFile);
}

/**
 * Pick the next frame in the rotation. If `lastFrameIndex` is out of
 * range (corrupt state, first run) we start at f0.
 */
export function nextFrame(state: AmbientState): { id: FrameId; index: number } {
  let last = -1;
  if (Number.isInteger(state.lastFrameIndex)) {
    last = state.lastFrameIndex;
  }

  const idx =
    ((last + 1) % FRAME_IDS.length + FRAME_IDS.length) %
    FRAME_IDS.length;

  return { id: FRAME_IDS[idx], index: idx };
}

function padRight(s: string, width: number): string {
  const pad = width - s.length;
  return pad > 0 ? `${s}${' '.repeat(pad)}` : s;
}

/**
 * On-chain sprite rows carry the body's centering whitespace baked in
 * (e.g. `      .[||].` for the robot head). Drop blank leading rows so
 * the sprite anchors to the block top, then strip the common left margin
 * so the rendered block has one space of padding on each side of the
 * sprite (matching the ` | ` joke separator).
 *
 * Interior or trailing whitespace-only rows collapse to `""`. If they
 * survived as long blank strings they would dominate the row-set width
 * and shift the joke column right — the same bug class this helper exists
 * to fix.
 */
function dedentRows(rows: string[]): string[] {
  let start = 0;
  while (start < rows.length && rows[start].trim() === '') {
    start++;
  }
  const anchored = rows.slice(start);
  if (anchored.length === 0) {
    return [];
  }

  let minLead = Infinity;
  for (const r of anchored) {
    if (r.trim() === '') continue;
    const lead = r.length - r.trimStart().length;
    if (lead < minLead) minLead = lead;
  }

  return anchored.map((r) => {
    if (r.trim() === '') return '';
    if (!Number.isFinite(minLead) || minLead === 0) return r;
    return r.length >= minLead ? r.slice(minLead) : r;
  });
}

/**
 * Build the additionalContext payload the hook returns when cadence emits.
 *
 * Lite and full mode share this layout — cadence is the only axis of
 * differentiation. Off mode short-circuits at the caller.
 *
 * Returns `null` when the normalized sprite has zero visible rows. The
 * ambient ruleset tells the model to render whenever it sees the
 * `DISPLAY_BUDDY` anchor; emitting that anchor with an empty fenced block
 * would still trigger render and produce a degenerate one-row joke
 * column. Failing closed to `null` lets the caller route to `{}`.
 */
export function buildAdditionalContext(
  spriteRows: string[],
  options: BuildOptions = {},
): string | null {
  const dedented = dedentRows(spriteRows);
  if (dedented.length === 0) {
    return null;
  }
  const width = dedented.reduce((m, r) => Math.max(m, r.length), 0);
  const overrides = options.jokeOverrides ?? [];
  const rows = dedented.map((r, i) => {
    const joke = overrides[i] ?? '';
    return ` ${padRight(r, width)} | ${joke}`;
  });
  const block = ['```', ...rows, '```'].join('\n');
  const directive = options.coldNudgeActive
    ? `${COLD_NUDGE_DIRECTIVE}\n${DISPLAY_BUDDY_DIRECTIVE}`
    : DISPLAY_BUDDY_DIRECTIVE;
  return `${directive}\n\n${block}`;
}

export interface RenderArgs {
  projectDir: string;
  accountUuid: string;
  tokenId: bigint;
  net: PluginNetworkInfo;
}

/**
 * Resolve the next ambient frame end-to-end:
 *   1. Read state for this (project, account, network).
 *   2. If account or chain changed, reset to fresh rotation.
 *   3. Pick the next frame id.
 *   4. Read that frame from the SessionStart/slash-populated art cache.
 *   5. On success, persist the rotation cursor and return rows.
 *
 * This function does zero network I/O. That invariant enforces the v0.4.0
 * contract that ambient UserPromptSubmit never calls the chain.
 *
 * Returns `null` on any soft failure — hook then emits `{}` so the
 * user's prompt path stays untouched.
 */
export async function renderAmbientFrame(
  args: RenderArgs,
): Promise<{ rows: string[]; frameId: FrameId } | null> {
  const identity = await readIdentityTuple();
  const cache = readArtCache();
  if (cache === null) {
    return null;
  }

  if (!cacheMatchesIdentityAndToken(cache, identity, args.tokenId)) {
    return null;
  }

  const path = stateFilePath(args.projectDir, args.accountUuid, args.net.chainId);
  const prev = readState(path);
  const sameAccountAndChain =
    prev.accountUuid === args.accountUuid && prev.chainId === args.net.chainId;
  let baseline: AmbientState = prev;

  if (!sameAccountAndChain) {
    baseline = {
      lastFrameIndex: -1,
      accountUuid: args.accountUuid,
      chainId: args.net.chainId,
    };
  }

  // Rotate forward, falling back through the rotation if a frame is
  // empty (defensive against future renderer changes that drop a frame).
  for (let attempt = 0; attempt < FRAME_IDS.length; attempt++) {
    const candidate =
      ((baseline.lastFrameIndex + 1 + attempt) % FRAME_IDS.length +
        FRAME_IDS.length) %
      FRAME_IDS.length;
    const id = FRAME_IDS[candidate];
    const rows = cache.frames[id] ?? [];

    if (rows.length > 0) {
      writeState(path, {
        lastFrameIndex: candidate,
        accountUuid: args.accountUuid,
        chainId: args.net.chainId,
      });
      return { rows: [...rows], frameId: id };
    }
  }

  return null;
}

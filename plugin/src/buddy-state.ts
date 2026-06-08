// Buddy state — single source of truth for the on-disk `.buddy-state` JSON.
//
// `mutateState` is the only public write API. It performs an atomic
// read-modify-write through `safe-json-store` and applies a monotonic merge
// guard so concurrent writes from multiple Claude terminals cannot regress
// hatch state or token id.
//
// Schema v4 persists mode, hatch, identity tuple, warm token id, turn counter,
// and cold nudge counter. Older/malformed state files are ignored and reset
// through the default state on the next write.
//
// Monotonic merge rules:
//   - latest identity is fully unset (all-null tuple) → accept candidate's
//     identity outright without reset. First write seeds identity rather
//     than colliding with the default-state nulls.
//   - identity mismatch (real ≠ real) → reset hatch to `unknown`, clear
//     tokenId, and zero the cold nudge counter.
//   - same identity, latest=warm + candidate=unknown → keep warm + tokenId
//     unless the caller opts out via `preserveKnownHatchOnUnknown: false`
//     (warm-specific gate, used on SessionStart RPC fail).
//   - same identity, latest=cold + candidate=unknown → keep cold
//     (cold-stickiness is unconditional; the policy flag is intentionally
//     warm-only by design; cold stickiness remains unconditional).
//   - non-warm states always clear tokenId.

import { createHash } from "node:crypto";

import { isValidUuid } from "~shared/isValidUuid";
import { readClaudeConfig, extractIdentity } from "./config-reader";
import { getActiveNetwork } from "./network";
import { safeReadJson, safeWriteJson } from "./safe-json-store";
import { buddyStatePath } from "./plugin-paths";
import { sameIdentity, identityIsUnset } from "./identity";
import { isPlainObject } from "./plain-object";

export type ModeLevel = "off" | "lite" | "full";
export type HatchState = "unknown" | "cold" | "warm";

export interface IdentityTuple {
  accountUuidHash: string | null;
  chainId: number | null;
  contractAddress: string | null;
}

export interface BuddyStateV4 extends IdentityTuple {
  schemaVersion: 4;
  mode: ModeLevel;
  hatch: HatchState;
  tokenId: string | null;
  turnCounter: number;
  coldNudgeCounter: number;
}

export class BuddyStateWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuddyStateWriteError";
  }
}

const VALID_MODE = new Set<ModeLevel>(["off", "lite", "full"]);
const VALID_HATCH = new Set<HatchState>(["unknown", "cold", "warm"]);
const MAX_STATE_BYTES = 8 * 1024;

const V4_KEYS = [
  "accountUuidHash",
  "chainId",
  "coldNudgeCounter",
  "contractAddress",
  "hatch",
  "mode",
  "schemaVersion",
  "tokenId",
  "turnCounter",
].sort();

export function statePath(): string {
  return buddyStatePath();
}

export function defaultState(): BuddyStateV4 {
  return {
    schemaVersion: 4,
    mode: "full",
    hatch: "unknown",
    tokenId: null,
    accountUuidHash: null,
    chainId: null,
    contractAddress: null,
    turnCounter: 0,
    coldNudgeCounter: 0,
  };
}

function isMode(value: unknown): value is ModeLevel {
  return typeof value === "string" && VALID_MODE.has(value as ModeLevel);
}

function isHatch(value: unknown): value is HatchState {
  return typeof value === "string" && VALID_HATCH.has(value as HatchState);
}

function normalizeIdentity(raw: Record<string, unknown>): IdentityTuple | null {
  const { accountUuidHash, chainId, contractAddress } = raw;

  if (accountUuidHash !== null && typeof accountUuidHash !== "string") return null;
  if (contractAddress !== null && typeof contractAddress !== "string") return null;
  if (chainId !== null) {
    if (!Number.isInteger(chainId)) return null;
    if ((chainId as number) <= 0) return null;
  }

  return {
    accountUuidHash: accountUuidHash as string | null,
    chainId: chainId as number | null,
    contractAddress: contractAddress === null ? null : (contractAddress as string).toLowerCase(),
  };
}

export function validateStateV4(raw: unknown): BuddyStateV4 | null {
  if (!isPlainObject(raw)) return null;

  const keys = Object.keys(raw).sort();
  if (keys.length !== V4_KEYS.length) return null;
  if (keys.some((k, i) => k !== V4_KEYS[i])) return null;

  if (raw.schemaVersion !== 4) return null;
  if (!isMode(raw.mode) || !isHatch(raw.hatch)) return null;

  if (typeof raw.turnCounter !== "number") return null;
  if (!Number.isInteger(raw.turnCounter) || raw.turnCounter < 0) return null;
  if (typeof raw.coldNudgeCounter !== "number") return null;
  if (!Number.isInteger(raw.coldNudgeCounter) || raw.coldNudgeCounter < 0) return null;

  const identity = normalizeIdentity(raw);
  if (identity === null) return null;

  const tokenId = raw.tokenId;
  if (raw.hatch === "warm") {
    if (typeof tokenId !== "string" || !/^0x[0-9a-f]+$/i.test(tokenId)) return null;
  } else if (tokenId !== null) {
    return null;
  }

  return {
    schemaVersion: 4,
    mode: raw.mode,
    hatch: raw.hatch,
    tokenId: tokenId === null ? null : (tokenId as string).toLowerCase(),
    accountUuidHash: identity.accountUuidHash,
    chainId: identity.chainId,
    contractAddress: identity.contractAddress,
    turnCounter: raw.turnCounter,
    coldNudgeCounter: raw.coldNudgeCounter,
  };
}

export function readState(path: string = statePath()): BuddyStateV4 | null {
  return safeReadJson(path, validateStateV4, MAX_STATE_BYTES);
}

function clearTokenIfNotWarm(state: BuddyStateV4): BuddyStateV4 {
  if (state.hatch === "warm") return state;
  return { ...state, tokenId: null };
}

export interface MutateStateOptions {
  preserveKnownHatchOnUnknown?: boolean;
  resetColdNudgeCounter?: boolean;
}

interface MergePolicy {
  preserveKnownHatchOnUnknown: boolean;
  resetColdNudgeCounter: boolean;
}

function monotonicMerge(
  latest: BuddyStateV4,
  next: BuddyStateV4,
  policy: MergePolicy,
): BuddyStateV4 {
  const candidate: BuddyStateV4 = {
    ...next,
    turnCounter: Math.max(latest.turnCounter, next.turnCounter),
    coldNudgeCounter: policy.resetColdNudgeCounter
      ? 0
      : Math.max(latest.coldNudgeCounter, next.coldNudgeCounter),
  };

  // Latest identity unset (all-null tuple) means we have never persisted a
  // real identity yet. Accept candidate's identity outright; do not treat
  // first-write as a mismatch reset.
  if (identityIsUnset(latest) && !identityIsUnset(candidate)) {
    return clearTokenIfNotWarm(candidate);
  }

  if (!sameIdentity(latest, candidate)) {
    return {
      ...candidate,
      hatch: "unknown",
      tokenId: null,
      coldNudgeCounter: 0,
    };
  }

  // warm-sticky (RPC-fail only): preserve known-warm cache against a
  // transient `unknown` candidate (e.g. cold-rpc-unavailable). A fresh
  // confirmed `cold-miss` (RPC succeeded, contract returned tokenId=0)
  // MUST clear warm cache so we don't lie about a burned/migrated token.
  if (
    policy.preserveKnownHatchOnUnknown &&
    latest.hatch === "warm" &&
    candidate.hatch === "unknown"
  ) {
    return {
      ...candidate,
      hatch: "warm",
      tokenId: latest.tokenId,
    };
  }

  // Unknown candidate cannot clobber a verified cold latest. The policy flag
  // above is intentionally warm-only; cold-stickiness stays unconditional.
  if (latest.hatch === "cold" && candidate.hatch === "unknown") {
    return {
      ...candidate,
      hatch: latest.hatch,
      tokenId: latest.tokenId,
    };
  }

  return clearTokenIfNotWarm(candidate);
}

export function mutateState(
  transform: (current: BuddyStateV4) => BuddyStateV4,
  options: MutateStateOptions = {},
): BuddyStateV4 {
  const path = statePath();
  const base = readState(path) ?? defaultState();
  const policy: MergePolicy = {
    preserveKnownHatchOnUnknown: options.preserveKnownHatchOnUnknown ?? true,
    resetColdNudgeCounter: options.resetColdNudgeCounter ?? false,
  };

  const transformed = validateStateV4(clearTokenIfNotWarm(transform({ ...base })));
  if (transformed === null) {
    throw new BuddyStateWriteError("invalid buddy state transform result");
  }

  // Re-read just before merge: another terminal may have written between
  // the initial read and the transform. Monotonic merge resolves the race.
  const latest = readState(path) ?? base;
  const merged = validateStateV4(monotonicMerge(latest, transformed, policy));
  if (merged === null) {
    throw new BuddyStateWriteError("invalid buddy state after merge");
  }

  if (!safeWriteJson(path, merged, validateStateV4)) {
    throw new BuddyStateWriteError(`failed to write buddy state: ${path}`);
  }

  return merged;
}

// Pre-deploy networks legitimately have `contractAddress === null` (no
// BuddyNFT deployed yet). Account hash + chainId are still meaningful, so
// the tuple may carry a real account + chainId with a null contract. The
// identity-mismatch invalidation guard must distinguish between "current
// less resolved than cache" (transient) and "both reflect pre-deploy"
// (consistent).
export async function readIdentityTuple(): Promise<IdentityTuple> {
  let accountUuidHash: string | null = null;
  try {
    const { config } = await readClaudeConfig();
    const accountUuid = extractIdentity(config).accountUuid.trim().toLowerCase();
    accountUuidHash = isValidUuid(accountUuid)
      ? createHash("sha256").update(accountUuid).digest("hex")
      : null;
  } catch {
    accountUuidHash = null;
  }

  try {
    const net = getActiveNetwork();
    return {
      accountUuidHash,
      chainId: net.chainId,
      contractAddress: net.buddyNft?.toLowerCase() ?? null,
    };
  } catch {
    return { accountUuidHash, chainId: null, contractAddress: null };
  }
}

export function getEnvMode(): ModeLevel | null {
  const raw = process.env.BUDDY_MODE?.trim().toLowerCase();
  if (!raw) return null;
  return VALID_MODE.has(raw as ModeLevel) ? (raw as ModeLevel) : null;
}

// Cadence check is zero-based — `turnCounter=0` emits the first eligible prompt, then every N prompts thereafter.
export function derivedEveryNth(mode: ModeLevel): number {
  if (mode === "full") return 1;
  if (mode === "lite") return 3;
  return Number.POSITIVE_INFINITY;
}

export function modeFooterSentence(mode: ModeLevel): string {
  if (mode === "full") return "your buddy appears on every user prompt (mode: `full`).";
  if (mode === "lite") return "your buddy appears every 3rd prompt (mode: `lite`).";
  return "your buddy is silent on prompts (mode: `off`).";
}

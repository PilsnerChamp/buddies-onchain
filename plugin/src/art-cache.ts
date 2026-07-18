// Buddy art cache — the bridge between warm slash RPCs and ambient turns.
//
// Ambient UserPromptSubmit never performs chain RPC. `/buddy-onchain` warm
// lookups refresh the live on-chain SVG, extract sprite frames, and persist this
// tiny cache. SessionStart writes chain-facing state and, for a warm buddy
// whose cache is missing or mismatched, rebuilds it via a bounded tokenURI
// fetch (`ensureWarmArtCache`). Ambient reads only this file and degrades to
// `{}` when the cache is missing, stale, malformed, oversized, or symlinked.
// Full RPC boundary rules:
// `docs/plugin/ambient.md` § Why ambient is RPC-free + § Art cache.

import { unlinkSync } from "node:fs";

import type { IdentityTuple } from "./buddy-state";
import { safeReadJson, safeWriteJson } from "./safe-json-store";
import { buddyArtCachePath } from "./plugin-paths";
import { isPlainObject } from "./plain-object";

export interface BuddyArtCacheV1 {
  schemaVersion: 1;
  accountUuidHash: string;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  frames: Record<string, string[]>;
  cachedAtMs: number;
}

export class BuddyArtCacheWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuddyArtCacheWriteError";
  }
}

const MAX_CACHE_BYTES = 32 * 1024;
const CACHE_KEYS = [
  "accountUuidHash",
  "cachedAtMs",
  "chainId",
  "contractAddress",
  "frames",
  "schemaVersion",
  "tokenId",
].sort();

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isLowerHex(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-f]+$/.test(value);
}

function normalizeFrames(raw: unknown): Record<string, string[]> | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const frames: Record<string, string[]> = {};
  for (const [frameId, rows] of Object.entries(raw)) {
    if (!Array.isArray(rows)) {
      return null;
    }

    if (!rows.every((row) => typeof row === "string")) {
      return null;
    }

    frames[frameId] = [...rows];
  }

  return frames;
}

function validateArtCacheV1(raw: unknown): BuddyArtCacheV1 | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const keys = Object.keys(raw).sort();
  if (keys.length !== CACHE_KEYS.length) {
    return null;
  }

  if (keys.some((key, index) => key !== CACHE_KEYS[index])) {
    return null;
  }

  if (raw.schemaVersion !== 1) {
    return null;
  }

  if (!isSha256Hex(raw.accountUuidHash)) {
    return null;
  }

  if (!Number.isInteger(raw.chainId) || (raw.chainId as number) <= 0) {
    return null;
  }

  if (!isLowerHex(raw.contractAddress) || !isLowerHex(raw.tokenId)) {
    return null;
  }

  if (typeof raw.cachedAtMs !== "number" || !Number.isInteger(raw.cachedAtMs)) {
    return null;
  }

  if (raw.cachedAtMs < 0) {
    return null;
  }

  const frames = normalizeFrames(raw.frames);
  if (frames === null) {
    return null;
  }

  return {
    schemaVersion: 1,
    accountUuidHash: raw.accountUuidHash,
    chainId: raw.chainId as number,
    contractAddress: raw.contractAddress,
    tokenId: raw.tokenId,
    frames,
    cachedAtMs: raw.cachedAtMs,
  };
}

function tokenHex(tokenId: string | bigint | null): string | null {
  if (tokenId === null) {
    return null;
  }

  if (typeof tokenId === "bigint") {
    return `0x${tokenId.toString(16)}`;
  }

  return tokenId.toLowerCase();
}

export function artCachePath(): string {
  return buddyArtCachePath();
}

export function readArtCache(): BuddyArtCacheV1 | null {
  return safeReadJson(artCachePath(), validateArtCacheV1, MAX_CACHE_BYTES);
}

export function writeArtCache(cache: BuddyArtCacheV1): void {
  if (!safeWriteJson(artCachePath(), cache, validateArtCacheV1)) {
    throw new BuddyArtCacheWriteError(
      `failed to write buddy art cache: ${artCachePath()}`,
    );
  }
}

export function clearArtCache(): void {
  try {
    unlinkSync(artCachePath());
  } catch {
    // Missing cache is fine.
  }
}

export function cacheMatchesIdentityAndToken(
  cache: BuddyArtCacheV1,
  identity: IdentityTuple,
  tokenId: string | bigint | null,
): boolean {
  const token = tokenHex(tokenId);
  if (token === null) {
    return false;
  }

  return (
    cache.accountUuidHash === identity.accountUuidHash &&
    cache.chainId === identity.chainId &&
    cache.contractAddress === identity.contractAddress?.toLowerCase() &&
    cache.tokenId === token
  );
}

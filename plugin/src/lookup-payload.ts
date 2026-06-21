// Lookup payload resolver for `/buddy-onchain`: live chain resolution produces
// the render payload, persisted hatch cache, decision-module inputs, and
// warm-path art cache for ambient turns.
//
// Legacy `resolveLookupPayload` contract: NEVER logs, NEVER calls process.exit,
// NEVER throws past its own try/catch. The hook is the last line of defense for
// soft-fail discipline, and an unhandled throw past stdin drain would blow the
// hook timeout. Its failure paths fold to `null` and the caller emits `{}`.
// The shared chain writer below has its own documented throwing contract so
// SessionStart / slash callers can choose their local soft-fail behavior.

import { isValidUuid } from "~shared/isValidUuid";
import { readClaudeConfig, extractIdentity } from "./config-reader";
import {
  hatchUrl as buildHatchUrl,
  resolveDeepLink,
  siteOriginForKey,
  warmUrl,
  type LookupResult,
} from "./lookup";
import {
  FRAME_IDS,
  extractCardLines,
  extractSpriteFrame,
  fetchTokenSvg,
} from "./sprite";
import { getActiveNetwork, type PluginNetworkInfo } from "./network";
import {
  modeFooterSentence,
  getEnvMode,
  mutateState,
  readIdentityTuple,
  readState,
} from "./buddy-state";
import type {
  BuddyStateV4,
  IdentityTuple,
  ModeLevel,
} from "./buddy-state";
import {
  cacheMatchesIdentityAndToken,
  clearArtCache,
  readArtCache,
  writeArtCache,
} from "./art-cache";
import { sleepingFrame } from "./sleeping-frame";
import {
  resolveBuddyStatusMessage,
  type BuddyStatus,
} from "./buddy-status-message";
import { deriveEffective, type EffectiveState } from "./effective-state";
import { applySleepIndicator } from "./sprite-decorations";
import {
  currentIdentityIsLessResolvedThanCache,
  identityIsUnset,
  sameIdentity,
} from "./identity";

export interface LookupPayload {
  buddyStatus: BuddyStatus;
  cardLines: string[];
  viewUrl: string;
  hatchUrl: string;
  openseaCollectionUrl: string | null;
  // Chain facts for the cold hatch disclosure (point-of-action, slash-only).
  // `null` contract = pre-deploy chain; `null` explorer = no public explorer
  // (e.g. local). Disclosure degrades gracefully when either is null.
  contractAddress: string | null;
  explorerAddressBase: string | null;
  chainDisplayName: string;
  effectiveMode: ModeLevel;
  persistedMode: ModeLevel;
}

export interface ResolveLookupArgs {
  accountUuidOverride?: string;
  netOverride?: PluginNetworkInfo;
}

export class BuddyChainStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuddyChainStateError";
  }
}

type ChainStatus = "online" | "offline";

function resultToHatch(reason: LookupResult["reason"]): BuddyStateV4["hatch"] {
  if (reason === "warm-hatched") return "warm";
  if (reason === "cold-miss") return "cold";
  return "unknown";
}

function resultToChainStatus(reason: LookupResult["reason"]): ChainStatus {
  if (reason === "warm-hatched" || reason === "cold-miss") return "online";
  return "offline";
}

function tokenHex(tokenId: bigint): string {
  return `0x${tokenId.toString(16)}`;
}

function warmViewUrlFromState(origin: string, tokenIdHex: string | null): string {
  if (tokenIdHex === null) {
    return `${origin}/view`;
  }
  try {
    return warmUrl(origin, BigInt(tokenIdHex));
  } catch {
    return `${origin}/view`;
  }
}

function identityCanCacheArt(identity: IdentityTuple): identity is {
  accountUuidHash: string;
  chainId: number;
  contractAddress: string;
} {
  return (
    identity.accountUuidHash !== null &&
    identity.chainId !== null &&
    identity.contractAddress !== null
  );
}

/**
 * Populate the ambient-only art cache from a SVG already fetched by the
 * warm slash lookup path. Takes the SVG as input so slash can fetch tokenURI
 * once and derive both card lines and cache frames from the same payload —
 * no double RPC.
 */
function populateArtCacheFromSvg(
  svg: string,
  tokenId: bigint,
  identity: IdentityTuple,
): void {
  if (!identityCanCacheArt(identity)) {
    return;
  }

  const frames: Record<string, string[]> = {};
  for (const frameId of FRAME_IDS) {
    const rows = extractSpriteFrame(svg, frameId);
    if (rows.length > 0) {
      frames[frameId] = rows;
    }
  }

  if (Object.keys(frames).length === 0) {
    return;
  }

  writeArtCache({
    schemaVersion: 1,
    accountUuidHash: identity.accountUuidHash,
    chainId: identity.chainId,
    contractAddress: identity.contractAddress.toLowerCase(),
    tokenId: tokenHex(tokenId),
    frames,
    cachedAtMs: Date.now(),
  });
}

// Switches cached identity to `identity` and resets hatch to `unknown`.
// Caller is committing to the new identity (post-mismatch invalidation).
function resetStateIdentity(identity: IdentityTuple): void {
  mutateState((state) => ({
    ...state,
    ...identity,
    hatch: "unknown",
    tokenId: null,
  }));
  clearArtCache();
}

function invalidateMismatchedIdentity(identity: IdentityTuple): void {
  const cached = readState();
  if (cached === null) return;
  if (identityIsUnset(cached)) return;
  if (sameIdentity(cached, identity)) return;

  // Transient identity-resolve failure (e.g. malformed deployment JSON
  // erasing the chainId/contractAddress that cache previously persisted)
  // must NOT clobber warm cache. Pre-deploy is fine because cache and
  // current both carry the same null contract — they match via
  // `sameIdentity` above and never reach this guard.
  if (currentIdentityIsLessResolvedThanCache(cached, identity)) return;

  resetStateIdentity(identity);
}

function sleepingCardLines(
  accountUuid: string,
  state: BuddyStateV4,
  effective: EffectiveState,
): string[] {
  return applySleepIndicator(
    sleepingFrame({ accountUuid }).rows,
    state,
    effective,
  );
}

/**
 * Resolve the user's on-chain buddy status, persist the chain-facing state,
 * and return the state plus local chain availability for render/cache work.
 *
 * Invalid UUIDs reject with `BuddyChainStateError`; hard errors from
 * `resolveDeepLink` bubble unchanged. Hook callers should wrap this function
 * and own their local soft-fail behavior.
 *
 * This function intentionally does not fetch tokenURI SVG or refresh warm art
 * cache. It only writes buddy chain state and clears stale art on identity
 * reset / verified cold.
 */
export async function resolveAndWriteBuddyChainState(args: {
  accountUuid: string;
  context: "session-start" | "slash";
  netOverride?: PluginNetworkInfo;
}): Promise<{
  state: BuddyStateV4;
  chainStatus: ChainStatus;
  identity: IdentityTuple;
}> {
  const canonicalUuid = args.accountUuid.trim().toLowerCase();
  if (!isValidUuid(canonicalUuid)) {
    throw new BuddyChainStateError("invalid accountUuid");
  }

  const currentIdentity = await readIdentityTuple();
  invalidateMismatchedIdentity(currentIdentity);

  const result = await resolveDeepLink(canonicalUuid, args.netOverride);
  const mappedHatch = resultToHatch(result.reason);
  const mappedChainStatus = resultToChainStatus(result.reason);
  const mappedTokenId =
    mappedHatch === "warm" && result.tokenId !== null
      ? tokenHex(result.tokenId)
      : null;
  const preserveKnownHatchOnUnknown = !(
    args.context === "session-start" && mappedHatch === "unknown"
  );
  const resetColdNudgeCounter =
    args.context === "slash" && result.reason === "cold-miss";

  const nextState = mutateState(
    (state) => ({
      ...state,
      ...currentIdentity,
      hatch: mappedHatch,
      tokenId: mappedTokenId,
      ...(resetColdNudgeCounter ? { coldNudgeCounter: 0 } : {}),
    }),
    { preserveKnownHatchOnUnknown, resetColdNudgeCounter },
  );

  if (mappedHatch === "cold") {
    clearArtCache();
  }

  return {
    state: nextState,
    chainStatus: mappedChainStatus,
    identity: currentIdentity,
  };
}

export async function resolveLookupPayload(
  args: ResolveLookupArgs = {},
): Promise<LookupPayload | null> {
  try {
    let accountUuid: string;
    if (args.accountUuidOverride !== undefined) {
      accountUuid = args.accountUuidOverride;
    } else {
      try {
        const { config } = await readClaudeConfig();
        accountUuid = extractIdentity(config).accountUuid;
      } catch {
        return null;
      }
    }

    const canonicalUuid = accountUuid.trim().toLowerCase();
    if (!isValidUuid(canonicalUuid)) return null;

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: canonicalUuid,
      context: "slash",
      netOverride: args.netOverride,
    });

    const net = args.netOverride ?? getActiveNetwork();
    const origin = siteOriginForKey(net.key);
    const concreteHatchUrl = buildHatchUrl(origin, canonicalUuid);
    const persistedMode = result.state.mode;
    const envMode = getEnvMode();
    const effective = deriveEffective(result.state, result.identity, envMode);
    const effectiveMode = effective.effectiveMode;
    let cardLines: string[] = sleepingCardLines(
      canonicalUuid,
      result.state,
      effective,
    );
    if (result.state.hatch === "warm" && result.state.tokenId !== null) {
      if (result.chainStatus === "online") {
        try {
          const tokenId = BigInt(result.state.tokenId);
          // Fetch the on-chain SVG once; derive both the card lines and the
          // ambient frame cache from the same payload. Slash may fetch tokenURI
          // (ambient may not — see `docs/plugin/ambient.md` § Why ambient is
          // RPC-free); this keeps it to ONE tokenURI per warm slash, not two.
          const svg = await fetchTokenSvg(tokenId, net);
          if (svg !== null) {
            const extracted = extractCardLines(svg);
            if (extracted.length > 0) {
              cardLines = extracted;
            }

            try {
              populateArtCacheFromSvg(svg, tokenId, result.identity);
            } catch {
              // Art cache only powers ambient nicety. Lookup still renders
              // the view URL/card even if cache write fails.
            }
          }
        } catch {
          // Sprite is decorative; warm path still renders with fallback chrome.
        }
      } else {
        const cache = readArtCache();
        const cachedRows = cache?.frames.f0;
        if (
          cache !== null &&
          cacheMatchesIdentityAndToken(cache, result.identity, result.state.tokenId) &&
          cachedRows !== undefined &&
          cachedRows.length > 0
        ) {
          cardLines = [...cachedRows];
        }
      }
    }

    const buddyStatus: BuddyStatus = result.state.hatch satisfies BuddyStatus;
    const viewUrl = warmViewUrlFromState(origin, result.state.tokenId);

    return {
      buddyStatus,
      cardLines,
      viewUrl,
      hatchUrl: concreteHatchUrl,
      openseaCollectionUrl: net.openseaCollectionUrl,
      contractAddress: net.buddyNft,
      explorerAddressBase: net.explorerAddressBase,
      chainDisplayName: net.displayName,
      effectiveMode,
      persistedMode,
    };
  } catch {
    return null;
  }
}

function pushCard(lines: string[], payload: LookupPayload): void {
  if (payload.cardLines.length === 0) {
    return;
  }

  lines.push("```");
  lines.push(...payload.cardLines);
  lines.push("```");
  lines.push("");
}

// Point-of-action disclosure for the cold (not-yet-hatched) slash render.
// Neutral facts the user can verify — never an endorsement. The plugin reads
// the chain and never signs; the only write is the user-initiated mint on the
// external dApp. Surfacing the expected transaction (contract, function, zero
// value, no approvals) lets the user diff it against their wallet preview, the
// strongest defense against phishing clones. Shown only on the explicit
// `/buddy-onchain` command — never auto-injected.
//
// RELEASE INVARIANT: `function hatch` below must match the dApp's mint entry.
// If the dApp ever routes the mint through a different function, update this
// copy in the SAME release — a stale name makes the wallet preview mismatch and
// the user cancel a legitimate transaction.
function coldHatchDisclosureLines(payload: LookupPayload): string[] {
  const lines: string[] = [
    "hatching is optional - your buddy works unhatched. this plugin is read-only and never connects to your wallet or requests signatures.",
  ];

  if (payload.contractAddress !== null) {
    lines.push(
      `to hatch you open the link, connect a wallet, and sign one ${payload.chainDisplayName} transaction (gas only - nothing to the plugin):`,
      `  contract ${payload.contractAddress} · function hatch · value 0 ETH · no token approvals`,
      "  if the transaction preview shows a different contract, nonzero ETH value, token approval, or spending access, cancel.",
    );
  } else {
    // No deployed contract for this network → no verifiable tx fingerprint, so
    // do not coach the user to sign a hatch with no checkable target. The
    // caller also suppresses the hatch URL + rerun line in this state so the
    // warning is not contradicted by a signing flow.
    lines.push(
      "hatch contract is not configured for this network - hatch unavailable from this build.",
    );
  }

  lines.push(
    "on-chain it writes a one-way identity hash + seed - a stable pseudonymous marker, not anonymous. your raw account id never leaves your machine.",
  );

  if (payload.contractAddress !== null && payload.explorerAddressBase !== null) {
    lines.push(
      `verify the contract: ${payload.explorerAddressBase}${payload.contractAddress}`,
    );
  }

  return lines;
}

export function formatLookupBlock(payload: LookupPayload): string {
  const lines: string[] = ["BUDDY_RENDER_BEGIN"];

  pushCard(lines, payload);

  const decision = resolveBuddyStatusMessage({
    buddyStatus: payload.buddyStatus,
  });
  const url = decision.urlTarget === "view" ? payload.viewUrl : payload.hatchUrl;

  lines.push(decision.message);

  // cold + no deployed contract = no verifiable hatch target. Suppress the
  // hatch URL and post-hatch rerun line so "hatch unavailable from this build"
  // is not contradicted by a signing flow.
  const hatchUnavailable =
    payload.buddyStatus === "cold" && payload.contractAddress === null;

  if (payload.buddyStatus === "cold") {
    lines.push(...coldHatchDisclosureLines(payload));
  }

  if (!hatchUnavailable) {
    lines.push(url);
  }

  if (payload.buddyStatus === "cold" && !hatchUnavailable) {
    lines.push(
      "after hatching, re-run `/buddy-onchain` or restart the session to see it wake.",
    );
  }

  if (payload.openseaCollectionUrl !== null) {
    lines.push(`see all hatched buddies: ${payload.openseaCollectionUrl}`);
  }

  lines.push("");

  // getEnvMode filters invalid → null, so divergence means env override is active.
  if (payload.effectiveMode !== payload.persistedMode) {
    lines.push(
      `note: \`BUDDY_MODE=${payload.effectiveMode}\` overrides saved mode until unset`,
    );
  }

  lines.push(modeFooterSentence(payload.effectiveMode));
  lines.push("change: `/buddy-onchain lite|full|off`");

  lines.push("BUDDY_RENDER_END");

  return lines.join("\n");
}

export function formatInvalidVerbBlock(verb: string): string {
  const safeVerb = verb.length > 0 ? verb : "<empty>";
  return [
    "BUDDY_RENDER_BEGIN",
    `unknown verb \`${safeVerb}\`. Use: \`off\` | \`lite\` | \`full\``,
    "BUDDY_RENDER_END",
  ].join("\n");
}

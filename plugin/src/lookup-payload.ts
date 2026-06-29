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
import { RENDER_VERBATIM_GUARD } from "./instructions";
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
  // Per-item OpenSea link for this token (warm only). `null` = pre-deploy,
  // no tokenId, or a network with no OpenSea surface (e.g. local).
  openseaItemUrl: string | null;
  // Chain facts for the hatch disclosure + the always-on deployment footer.
  // `null` contract = pre-deploy chain; `null` explorer = no public explorer
  // (e.g. local). Both degrade gracefully when either is null.
  contractAddress: string | null;
  explorerAddressBase: string | null;
  chainDisplayName: string;
  chainId: number;
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

// Per-item OpenSea link: `<openseaItemBase><contract>/<tokenId>`. Returns null
// unless the network exposes OpenSea, the contract is deployed, and we hold a
// tokenId (warm only). Contract is lowercased (OpenSea path convention); the
// explorer link keeps the checksum form.
function openseaItemUrlFromState(
  net: PluginNetworkInfo,
  tokenIdHex: string | null,
): string | null {
  if (net.openseaItemBase === null || net.buddyNft === null || tokenIdHex === null) {
    return null;
  }
  try {
    const tokenId = BigInt(tokenIdHex).toString();
    return `${net.openseaItemBase}${net.buddyNft.toLowerCase()}/${tokenId}`;
  } catch {
    return null;
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
      openseaItemUrl: openseaItemUrlFromState(net, result.state.tokenId),
      contractAddress: net.buddyNft,
      explorerAddressBase: net.explorerAddressBase,
      chainDisplayName: net.displayName,
      chainId: net.chainId,
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

// Cold (not-yet-hatched) context facts, slash-only. Labeled lines, scannable.
// The plugin states only what IT owns: that the buddy works unhatched (still
// shown, asleep), that the plugin is read-only and never signs, and the
// privacy model. It deliberately does NOT narrate the external mint
// transaction (function / value / approvals) — that is the wallet + dApp's
// surface, and the plugin cannot guarantee another system's tx shape. The
// verifiable contract the user diffs against lives in the deployment footer.
function coldHatchFactLines(payload: LookupPayload): string[] {
  if (payload.contractAddress === null) {
    // No deployed contract → hatch unavailable (caller suppresses the URL).
    return [
      "optional: unhatched, it still appears here sleeping.",
      "plugin: read-only; never connects to your wallet or requests signatures.",
    ];
  }

  return [
    "optional: unhatched, it still appears here sleeping; hatch to wake it, then re-run /buddy-onchain.",
    "plugin: read-only; never connects to your wallet or requests signatures.",
    // Generic wallet tripwire — no function name, no dApp coupling. The plugin
    // emits the hatch link, so it still owes the user a point-of-action check.
    "wallet: the tx should target the deployment below - decline token approvals, spending access, or unexpected ETH value.",
    "privacy: one-way identity hash + art seed onchain (pseudonymous, not anonymous); your raw account id stays local.",
  ];
}

// Always-on contract footer (every /buddy-onchain, all statuses): one line
// pointing at the exact deployed contract — the strongest verifiable trust
// signal and a standing "which contract am I transacting with" anchor. Prefers
// the explorer link; degrades to the raw address when the network has no public
// explorer (e.g. local). The caller blank-line-separates it from the body above
// and the mode line below.
function deploymentFooterLines(payload: LookupPayload): string[] {
  if (payload.contractAddress === null) {
    return [
      `deployment: ${payload.chainDisplayName} (${payload.chainId}) - no contract configured for this network`,
    ];
  }
  // Label-on-its-own-line, mirroring the view + opensea blocks. URL degrades to
  // the raw address when the network has no public explorer (e.g. local).
  const target =
    payload.explorerAddressBase !== null
      ? `${payload.explorerAddressBase}${payload.contractAddress}`
      : payload.contractAddress;
  return ["contract:", target];
}

export function formatLookupBlock(
  payload: LookupPayload,
  includeGuard = false,
): string {
  // RENDER_VERBATIM_GUARD precedes the sentinel — context-only, never printed
  // (the renderer reproduces only what is BETWEEN the sentinels). It stops the
  // first-prompt collision where a freshly-injected RULESET_AMBIENT leads the
  // host to decorate this card with the ambient sprite | joke columns.
  const lines: string[] = includeGuard
    ? [RENDER_VERBATIM_GUARD, "BUDDY_RENDER_BEGIN"]
    : ["BUDDY_RENDER_BEGIN"];

  pushCard(lines, payload);

  const decision = resolveBuddyStatusMessage({
    buddyStatus: payload.buddyStatus,
  });
  const url = decision.urlTarget === "view" ? payload.viewUrl : payload.hatchUrl;

  lines.push(decision.message);

  // cold + no deployed contract = no hatch target; suppress the hatch URL (the
  // deployment footer reports "no contract configured").
  const hatchUnavailable =
    payload.buddyStatus === "cold" && payload.contractAddress === null;

  if (!hatchUnavailable) {
    lines.push(url);
  }

  // Per-item OpenSea link, label-on-its-own-line to mirror the view block.
  // Warm-only (needs a tokenId); absent on cold/unknown and pre-deploy.
  if (payload.openseaItemUrl !== null) {
    lines.push("opensea:");
    lines.push(payload.openseaItemUrl);
  }

  // Footer. Cold gets a labeled context paragraph (optional / plugin / wallet /
  // privacy), blank-separated from the body above, with the contract line below
  // it (the wallet line references "the deployment below"). Warm/unknown have no
  // such paragraph, so the contract line joins the link list directly — one
  // contiguous block, no interior blank.
  if (payload.buddyStatus === "cold") {
    lines.push("");
    lines.push(...coldHatchFactLines(payload));
  }
  lines.push(...deploymentFooterLines(payload));
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

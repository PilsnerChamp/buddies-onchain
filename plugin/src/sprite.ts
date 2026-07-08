// plugin/src/sprite.ts
//
// Decode the on-chain BuddyNFT card to terminal-printable ASCII.
//
// The renderer composes the entire card from `<text>` elements (header
// chrome, the default-visible sprite frame `id="f0"`, and the stats
// footer) over a custom font. Because everything is text under the hood,
// we can decode the on-chain artwork to plain ASCII for terminal display
// — no rasterization, no ANSI graphics protocol, just regex over a
// closed-format SVG we own end-to-end.
//
// Soft-fail by design: any error returns null. Sprite/card rendering is
// decorative; slash/hook routing still owns the product action.

import { BUDDY_NFT_ABI } from './buddyNftAbi';
import { getPublicClient } from './publicClient';
import type { PluginNetworkInfo } from './network';

const JSON_PREFIX = 'data:application/json;base64,';
const SVG_PREFIX = 'data:image/svg+xml;base64,';

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Pull readable text content from the on-chain SVG card.
 *
 * Renderer contract (BuddyRenderer.sol):
 *   - 3 `class="stat"` text rows before the sprite frame (header, rarity
 *     line, top separator). The rarity row may contain a nested `<tspan>`
 *     for the shiny gold prefix.
 *   - `<g id="f0">` block with N `class="sprite"` rows — the default-
 *     visible animation frame.
 *   - 2 `class="stat"` rows after f0 (bottom separator, stats footer).
 *
 * If we don't see exactly that shape we return [], which lets the caller
 * silently skip the card rather than render something misaligned.
 */
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

export function extractCardLines(svg: string): string[] {
  const f0Match = svg.match(/<g\s+id="f0"[^>]*>([\s\S]*?)<\/g>/);
  if (!f0Match || typeof f0Match.index !== 'number') return [];
  const f0Idx = f0Match.index;
  const f0Block = f0Match[1];

  // Non-greedy inner-content match plus tag stripping so shiny titles
  // (which embed `<tspan>` inside the `<text>`) decode cleanly.
  const statRe = /<text\s+class="stat"[^>]*>([\s\S]*?)<\/text>/g;
  const before: string[] = [];
  const after: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = statRe.exec(svg)) !== null) {
    const cleaned = decodeEntities(stripTags(m[1]));
    if (m.index < f0Idx) before.push(cleaned);
    else after.push(cleaned);
  }
  if (before.length !== 3 || after.length !== 2) return [];

  const spriteRe = /<text\s+class="sprite"[^>]*>([\s\S]*?)<\/text>/g;
  const sprite: string[] = [];
  let s: RegExpExecArray | null;
  while ((s = spriteRe.exec(f0Block)) !== null) {
    sprite.push(decodeEntities(stripTags(s[1])));
  }
  if (sprite.length === 0) return [];

  // Drop the first stat row (`> /buddy-onchain` chrome echo) — the user just
  // typed the command, no value re-printing it. Markdown renderers also like
  // to treat leading `>` as a blockquote even inside fenced code, which
  // collapses the line in some viewers. Keep rarity row + top separator.
  const trimmedBefore = before.slice(1);

  // Trim trailing whitespace per line so terminals don't render stale
  // padding on narrow widths.
  const all = [...trimmedBefore, ...sprite, ...after].map((l) => l.replace(/\s+$/, ''));

  // Re-center sprite rows under the card rail. SVG bakes leading whitespace
  // sized for SVG x-coords, not terminal width, so sprite drifts left of
  // center. Rails are pure `─` runs; chrome rows (rarity + footer) carry
  // `│` separators and stay left-aligned. Sprite rows have neither, so the
  // (no `│`, not a rail) filter targets only them.
  const railRe = /^─+$/;
  const railWidth = all.find((l) => railRe.test(l))?.length ?? 0;
  if (railWidth === 0) return all;
  return all.map((l) => {
    if (railRe.test(l) || l.includes('│')) return l;
    const trimmed = l.replace(/^\s+/, '');
    if (trimmed.length >= railWidth) return l;
    return ' '.repeat(Math.floor((railWidth - trimmed.length) / 2)) + trimmed;
  });
}

function decodeBase64ToString(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}

/**
 * The four animation frames the renderer ships in every card SVG.
 * `f0` is the default-visible base pose; `f1`/`f2` are subtle wave
 * variants; `fb` is the blink (eyes closed). Animated via CSS keyframes
 * in the live SVG; for ambient terminal injection we pick one frame at
 * a time and rotate across calls.
 */
export const FRAME_IDS = ['f0', 'f1', 'f2', 'fb'] as const;
export type FrameId = (typeof FRAME_IDS)[number];

/**
 * Pull a single sprite frame by id from the SVG, returning its rows
 * (no chrome, no separators, no stats — sprite-only). Returns [] when
 * the frame block or its `<text class="sprite">` rows are missing.
 */
export function extractSpriteFrame(svg: string, frameId: FrameId): string[] {
  const re = new RegExp(`<g\\s+id="${frameId}"[^>]*>([\\s\\S]*?)<\\/g>`);
  const match = svg.match(re);
  if (!match) return [];
  const block = match[1];
  const spriteRe = /<text\s+class="sprite"[^>]*>([\s\S]*?)<\/text>/g;
  const rows: string[] = [];
  let s: RegExpExecArray | null;
  while ((s = spriteRe.exec(block)) !== null) {
    rows.push(decodeEntities(stripTags(s[1])));
  }
  return rows.map((r) => r.replace(/\s+$/, ''));
}

/**
 * Decode the on-chain SVG for `tokenId`. Returns the raw SVG string or
 * null on any failure (RPC, prefix mismatch, JSON parse). Used by slash
 * full-card rendering and ambient sprite-only rendering so the RPC + decode
 * logic lives in one place.
 */
export async function fetchTokenSvg(
  tokenId: bigint,
  net: PluginNetworkInfo,
): Promise<string | null> {
  if (net.buddyNft === null) return null;
  try {
    const tokenUri = (await getPublicClient().readContract({
      abi: BUDDY_NFT_ABI,
      address: net.buddyNft,
      functionName: 'tokenURI',
      args: [tokenId],
    })) as string;

    if (!tokenUri.startsWith(JSON_PREFIX)) return null;
    const json = JSON.parse(decodeBase64ToString(tokenUri.slice(JSON_PREFIX.length)));
    const image = typeof json?.image === 'string' ? json.image : null;
    if (!image || !image.startsWith(SVG_PREFIX)) return null;
    return decodeBase64ToString(image.slice(SVG_PREFIX.length));
  } catch {
    return null;
  }
}

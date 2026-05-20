/**
 * Tests for `plugin/src/sprite.ts` — on-chain SVG → terminal ASCII card.
 *
 * Pure parsing tests; no RPC, no contract. Fixtures mirror what
 * `BuddyRenderer.sol` emits today (closed format we control end-to-end):
 *   - 3 `class="stat"` rows before `<g id="f0">` (header echo, rarity
 *     line, top separator).
 *   - `<g id="f0">` with N `class="sprite"` rows (default-visible
 *     animation frame).
 *   - 2 `class="stat"` rows after f0 (bottom separator, footer stats).
 *
 * The header echo (`> /buddy-onchain`) is intentionally dropped from the
 * extracted output — see `sprite.ts` extractCardLines comment.
 */

import { describe, test, expect } from "bun:test";
import { extractCardLines, extractSpriteFrame } from "../src/sprite";

function buildSvg(opts: {
  header: string;
  rarity: string;
  topSep: string;
  sprite: string[];
  bottomSep: string;
  footer: string;
}): string {
  const spriteRows = opts.sprite
    .map((row) => `<text class="sprite" x="21" y="125" xml:space="preserve">${row}</text>`)
    .join("");
  return [
    "<svg>",
    `<text class="stat" x="16" y="28">${opts.header}</text>`,
    `<text class="stat" x="16" y="56">${opts.rarity}</text>`,
    `<text class="stat" x="16" y="82">${opts.topSep}</text>`,
    `<g id="f0" fill="#e2e8f0" font-size="37">${spriteRows}</g>`,
    `<text class="stat" x="16" y="372">${opts.bottomSep}</text>`,
    `<text class="stat" x="16" y="398">${opts.footer}</text>`,
    "</svg>",
  ].join("");
}

describe("extractCardLines", () => {
  test("non-shiny duck: rarity + separators + sprite + footer, drops header echo", () => {
    const svg = buildSvg({
      header: "&gt; /buddy-onchain",
      rarity: "COMMON │ DUCK │ HATCHED",
      topSep: "─────",
      sprite: ["     &lt;(· )___    ", "      (  ._&gt;     "],
      bottomSep: "─────",
      footer: "DBG 50 │ PAT 50 │ CHA 50 │ WIS 50 │ SNK 50",
    });

    const lines = extractCardLines(svg);

    expect(lines).toEqual([
      "COMMON │ DUCK │ HATCHED",
      "─────",
      "     <(· )___",
      "      (  ._>",
      "─────",
      "DBG 50 │ PAT 50 │ CHA 50 │ WIS 50 │ SNK 50",
    ]);
  });

  test("shiny title with nested <tspan> decodes cleanly", () => {
    // BuddyRenderer.sol § shiny title: rarity row wraps the gold prefix
    // in a `<tspan>` inside the `<text>`. The actual constant is
    // `SHINY_PREFIX = "✦SHINY✦ "` (BuddyRenderer.sol:78). Naive
    // `[^<]*` regex would truncate at the first `<`; we need
    // non-greedy + tag stripping.
    const svg = buildSvg({
      header: "&gt; /buddy-onchain",
      rarity:
        '<tspan fill="#FFC107" font-weight="bold">✦SHINY✦ </tspan>EPIC │ ROBOT │ HATCHED',
      topSep: "─────",
      sprite: ["      .[||]."],
      bottomSep: "─────",
      footer: "DBG 99",
    });

    const lines = extractCardLines(svg);

    expect(lines[0]).toBe("✦SHINY✦ EPIC │ ROBOT │ HATCHED");
    expect(lines).toContain("      .[||].");
    expect(lines.at(-1)).toBe("DBG 99");
  });

  test("missing f0 frame returns empty (refuse to render misaligned)", () => {
    const svg = '<svg><text class="stat">only</text></svg>';
    expect(extractCardLines(svg)).toEqual([]);
  });

  test("unexpected stat row count returns empty", () => {
    // Only 2 stat rows before f0 (renderer always emits 3) → shape we
    // don't recognize → refuse to render.
    const svg = [
      "<svg>",
      '<text class="stat">a</text>',
      '<text class="stat">b</text>',
      '<g id="f0"><text class="sprite">x</text></g>',
      '<text class="stat">c</text>',
      '<text class="stat">d</text>',
      "</svg>",
    ].join("");
    expect(extractCardLines(svg)).toEqual([]);
  });

  test("sprite rows re-center under card rail (wider rail than sprite)", () => {
    // Real renderer rails span ~43 cols while sprite trimmed widths are
    // 6–8. SVG sprite data ships with x-coord-sized leading whitespace
    // (5–6 spaces) which left-drifts under wider rails. extractCardLines
    // strips that and re-pads to floor((railWidth - trimmed.length) / 2)
    // so the sprite sits centered between rails.
    const rail = "─".repeat(43);
    const svg = buildSvg({
      header: "&gt; /buddy-onchain",
      rarity: "EPIC │ ROBOT │ HATCHED",
      topSep: rail,
      sprite: [
        "      .[||].",
        "     [ ×  × ]",
        "     [ ==== ]",
        "     `------´",
      ],
      bottomSep: rail,
      footer: "DBG 57 │ PAT 49 │ CHA 33 │ WIS 68 │ SNK 100",
    });

    const lines = extractCardLines(svg);

    expect(lines).toEqual([
      "EPIC │ ROBOT │ HATCHED",
      rail,
      `${" ".repeat(18)}.[||].`,
      `${" ".repeat(17)}[ ×  × ]`,
      `${" ".repeat(17)}[ ==== ]`,
      `${" ".repeat(17)}\`------´`,
      rail,
      "DBG 57 │ PAT 49 │ CHA 33 │ WIS 68 │ SNK 100",
    ]);
  });

  test("sprite rows keep raw indent when sprite is wider than rail", () => {
    // Defensive: if rail is narrower than sprite, centering would emit
    // a negative pad. Code falls back to the original line unchanged so
    // narrow-rail fixtures (and any future shrunken layouts) stay safe.
    const svg = buildSvg({
      header: "&gt; /buddy-onchain",
      rarity: "COMMON │ DUCK │ HATCHED",
      topSep: "─────",
      sprite: ["     <(· )___", "      (  ._>"],
      bottomSep: "─────",
      footer: "DBG 50 │ PAT 50 │ CHA 50 │ WIS 50 │ SNK 50",
    });

    const lines = extractCardLines(svg);

    expect(lines).toContain("     <(· )___");
    expect(lines).toContain("      (  ._>");
  });

  test("trailing whitespace per line is stripped", () => {
    const svg = buildSvg({
      header: "&gt; /buddy-onchain",
      rarity: "COMMON │ DUCK │ HATCHED   ",
      topSep: "─────  ",
      sprite: ["    sprite-row    "],
      bottomSep: "─────",
      footer: "footer",
    });
    const lines = extractCardLines(svg);
    expect(lines.every((l) => !/\s+$/.test(l))).toBe(true);
  });
});

describe("extractSpriteFrame", () => {
  // Multi-frame fixture mirroring the real renderer: f0 default-visible,
  // f1/f2/fb hidden, all four containing distinct sprite rows.
  const multiFrameSvg = [
    "<svg>",
    `<g id="f0" fill="#e2e8f0" font-size="37">`,
    `<text class="sprite" x="21" y="125">f0-row-A</text>`,
    `<text class="sprite" x="21" y="150">f0-row-B</text>`,
    `</g>`,
    `<g id="f1" visibility="hidden">`,
    `<text class="sprite" x="21" y="125">f1-row</text>`,
    `</g>`,
    `<g id="f2" visibility="hidden">`,
    `<text class="sprite" x="21" y="125">f2-row</text>`,
    `</g>`,
    `<g id="fb" visibility="hidden">`,
    `<text class="sprite" x="21" y="125">blink-row</text>`,
    `</g>`,
    "</svg>",
  ].join("");

  test("returns rows for the requested frame id", () => {
    expect(extractSpriteFrame(multiFrameSvg, "f0")).toEqual([
      "f0-row-A",
      "f0-row-B",
    ]);
    expect(extractSpriteFrame(multiFrameSvg, "f1")).toEqual(["f1-row"]);
    expect(extractSpriteFrame(multiFrameSvg, "f2")).toEqual(["f2-row"]);
    expect(extractSpriteFrame(multiFrameSvg, "fb")).toEqual(["blink-row"]);
  });

  test("missing frame id returns []", () => {
    const onlyF0 =
      '<svg><g id="f0"><text class="sprite">x</text></g></svg>';
    expect(extractSpriteFrame(onlyF0, "f1")).toEqual([]);
  });

  test("decodes entities and strips inline tags", () => {
    const svg =
      '<svg><g id="f0"><text class="sprite">&lt;(<tspan>·</tspan> )___</text></g></svg>';
    expect(extractSpriteFrame(svg, "f0")).toEqual(["<(· )___"]);
  });
});

#!/usr/bin/env node
// onchain/contract-data/fonts/glyph-audit.mjs
//
// Diagnostic: prints the derived sprite and chrome font glyph sets from
// buddies-source.mjs. The derived arrays are the source of truth — this
// script reports what they contain and outputs a ready-to-use pyftsubset
// Unicode expression.
//
// Read-only — no writes, no mutations. Same role as sprite-audit.mjs
// but for font glyph coverage.
//
// Usage:
//   node onchain/contract-data/fonts/glyph-audit.mjs           # full diagnostic report
//   node onchain/contract-data/fonts/glyph-audit.mjs --expr sprite  # pyftsubset expr for sprite font
//   node onchain/contract-data/fonts/glyph-audit.mjs --expr chrome  # pyftsubset expr for chrome font
//   node onchain/contract-data/fonts/glyph-audit.mjs --expr union   # pyftsubset expr for combined union

import {
  SPRITE_FONT_GLYPHS,
  CHROME_FONT_GLYPHS,
  EYES,
  SPECIES_ORDER,
  RARITIES,
  STAGES,
  STAT_NAMES,
  STAT_ABBREVS,
} from "../sprites/buddies-source.mjs";

function fmt(ch) {
  const cp = ch.codePointAt(0);
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  const display = cp >= 0x20 && cp <= 0x7e ? ch : `[${hex}]`;
  return `${display} ${hex}`;
}

function printSet(label, glyphs) {
  console.log(`\n${label} (${glyphs.length} codepoints):`);
  for (const ch of glyphs) {
    console.log(`  ${fmt(ch)}`);
  }
}

// Build a compact pyftsubset Unicode expression from a sorted glyph array.
// Merges adjacent codepoints into ranges (U+0041-0045) for brevity.
function toPyftsubsetExpr(glyphs) {
  const cps = glyphs.map((ch) => ch.codePointAt(0));
  const ranges = [];
  let i = 0;
  while (i < cps.length) {
    const start = cps[i];
    let end = start;
    while (i + 1 < cps.length && cps[i + 1] === end + 1) {
      end = cps[++i];
    }
    const s = `U+${start.toString(16).toUpperCase().padStart(4, "0")}`;
    if (start === end) {
      ranges.push(s);
    } else {
      ranges.push(`${s}-${end.toString(16).toUpperCase().padStart(4, "0")}`);
    }
    i++;
  }
  return ranges.join(",");
}

// --- --expr mode: output just the pyftsubset expression for piping into subset scripts ---
const exprArg = process.argv.indexOf("--expr");
if (exprArg !== -1) {
  const target = process.argv[exprArg + 1];
  const union = [...new Set([...SPRITE_FONT_GLYPHS, ...CHROME_FONT_GLYPHS])].sort(
    (a, b) => a.codePointAt(0) - b.codePointAt(0),
  );
  const sets = { sprite: SPRITE_FONT_GLYPHS, chrome: CHROME_FONT_GLYPHS, union };
  if (!target || !sets[target]) {
    console.error(`Usage: --expr sprite|chrome|union`);
    process.exit(1);
  }
  process.stdout.write(toPyftsubsetExpr(sets[target]));
  process.exit(0);
}

// --- Derive union ---
const union = [...new Set([...SPRITE_FONT_GLYPHS, ...CHROME_FONT_GLYPHS])].sort(
  (a, b) => a.codePointAt(0) - b.codePointAt(0),
);

// --- Derive exclusive sets ---
const spriteSet = new Set(SPRITE_FONT_GLYPHS);
const chromeSet = new Set(CHROME_FONT_GLYPHS);
const spriteOnly = SPRITE_FONT_GLYPHS.filter((ch) => !chromeSet.has(ch));
const chromeOnly = CHROME_FONT_GLYPHS.filter((ch) => !spriteSet.has(ch));
const shared = SPRITE_FONT_GLYPHS.filter((ch) => chromeSet.has(ch));

// --- Print report ---
console.log("=== Font Glyph Audit ===\n");

printSet("SPRITE_FONT_GLYPHS (DejaVu Sans Mono / .sprite)", SPRITE_FONT_GLYPHS);
printSet("CHROME_FONT_GLYPHS (Iosevka SemiBold / .header, .stat)", CHROME_FONT_GLYPHS);
printSet("Union (both fonts combined)", union);
printSet("Sprite-only (not needed by chrome)", spriteOnly);
printSet("Chrome-only (not needed by sprites)", chromeOnly);
printSet("Shared (needed by both)", shared);

// --- Summary ---
console.log("\n=== Summary ===\n");
console.log(`Sprite glyphs:  ${SPRITE_FONT_GLYPHS.length}`);
console.log(`Chrome glyphs:  ${CHROME_FONT_GLYPHS.length}`);
console.log(`Sprite-only:    ${spriteOnly.length}`);
console.log(`Chrome-only:    ${chromeOnly.length}`);
console.log(`Shared:         ${shared.length}`);
console.log(`Union:          ${union.length}`);

// --- pyftsubset expression ---
console.log("\n=== pyftsubset Unicode expression (from derived union) ===\n");
console.log(toPyftsubsetExpr(union));

// --- Eye glyph cross-font check ---
console.log("\n=== Eye glyph routing ===\n");
const eyeAll = [...EYES, "?"];
for (const eye of eyeAll) {
  const inSprite = spriteSet.has(eye) ? "sprite ✓" : "sprite ✗";
  const inChrome = chromeSet.has(eye) ? "chrome ✓" : "chrome ✗";
  console.log(`  ${fmt(eye)}  ${inSprite}  ${inChrome}`);
}

// --- Uppercase coverage for terminal _upper() ---
console.log("\n=== Terminal uppercase coverage ===\n");
const allLabels = [
  ...SPECIES_ORDER, ...RARITIES, ...STAGES,
  ...STAT_NAMES,
];
const missingUpper = [];
for (const label of allLabels) {
  for (const ch of label.toUpperCase()) {
    if (!chromeSet.has(ch) && ch !== " ") {
      missingUpper.push({ label, ch });
    }
  }
}
for (const abbr of STAT_ABBREVS) {
  for (const ch of abbr) {
    if (!chromeSet.has(ch)) {
      missingUpper.push({ label: abbr, ch });
    }
  }
}

if (missingUpper.length === 0) {
  console.log("✓ All uppercase label characters present in chrome set.");
} else {
  console.log("⚠ Missing uppercase characters:");
  for (const { label, ch } of missingUpper) {
    console.log(`  ${fmt(ch)} — needed by "${label.toUpperCase()}"`);
  }
}

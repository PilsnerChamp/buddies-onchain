#!/usr/bin/env node
// Diagnostic-only sprite audit. Reuses the generator's visible-column
// tokenizer and exact frame-0 centering model so audit numbers match what
// the generator actually emits. Shows authored offset, frame-0-derived
// shared shift, and post-normalization offset (see
// `docs/onchain/renderer.md` § Horizontal centering). NEVER writes to
// contracts/.

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

import {
  tokenize,
  computeFrame0Shift,
  centerSpecies,
  centerHat,
  SLOT_COLS,
} from "./gen-sprite-data.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = onchain/contract-data/sprites/tools. Sibling resolve for source; 4 ..s to repo root.
const SOURCE_PATH = resolve(HERE, "..", "buddies-source.mjs");
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");

async function loadSource() {
  const url = pathToFileURL(SOURCE_PATH).href + `?t=${Date.now()}`;
  return await import(url);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function fmtSigned(n, digits = 1) {
  if (n === 0) return " 0" + (digits ? "." + "0".repeat(digits) : "");
  const sign = n > 0 ? "+" : "-";
  const mag = Math.abs(n);
  return sign + mag.toFixed(digits);
}

function fmtShift(n) {
  if (n === 0) return "+0";
  return n > 0 ? `+${n}` : `${n}`;
}

// Visible-column bbox for a single row. Returns null if row is all spaces.
function rowBboxCols(row) {
  const tokens = tokenize(row);
  let first = -1, last = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== "space") {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1) return null;
  return { first, last, width: last - first + 1 };
}

function auditSpecies(name, frames) {
  // Authored (pre-normalization) frame-0 bbox, in visible columns.
  const f0 = computeFrame0Shift(frames[0], name);
  const shifted = centerSpecies(name, frames);
  const actual = shifted.info.actualShift;

  const out = [];
  // Species-level summary line.
  const slotCenter = (SLOT_COLS - 1) / 2;
  const authoredCenter = f0.bboxLeft === null ? null : (f0.bboxLeft + f0.bboxRight) / 2;
  const postCenter = authoredCenter === null ? null : authoredCenter + actual;
  const authoredOffset = authoredCenter === null ? 0 : authoredCenter - slotCenter;
  const postOffset = postCenter === null ? 0 : postCenter - slotCenter;
  out.push(
    `${pad(name, 10)} ` +
    `bbox=${pad(`${f0.bboxLeft}..${f0.bboxRight}`, 5)} ` +
    `w=${pad(f0.bboxWidth, 2)} ` +
    `authored-offset=${fmtSigned(authoredOffset)} ` +
    `shift=${fmtShift(actual)} ` +
    `post-offset=${fmtSigned(postOffset)}`
  );
  return out;
}

async function main() {
  const source = await loadSource();
  const { SPECIES_ORDER, HAT_ORDER, bodySprites, hats } = source;

  process.stdout.write("# body sprites -- visible-column model; matches generator normalization\n");
  process.stdout.write("# offset = (bbox-center - slot-center) in visible columns; slot-center = 8.0 cols\n");
  process.stdout.write("# frame 0 determines the shared shift; later frames must fit that exact move or generation fails\n\n");

  for (const name of SPECIES_ORDER) {
    const lines = auditSpecies(name, bodySprites[name].frames);
    for (const ln of lines) process.stdout.write(ln + "\n");
  }

  process.stdout.write("\n# hats -- 13-col slot centering; renderer pads 2+2 spaces to align with body slot\n\n");
  const hatSlotCenter = (13 - 1) / 2;
  for (const name of HAT_ORDER) {
    const row = hats[name];
    const bbox = rowBboxCols(row);
    if (!bbox) {
      process.stdout.write(`${pad(name, 12)} empty row\n`);
      continue;
    }
    const authoredCenter = (bbox.first + bbox.last) / 2;
    const authoredOffset = authoredCenter - hatSlotCenter;
    const result = centerHat(name, row);
    const shifted = rowBboxCols(result.row);
    const postCenter = shifted ? (shifted.first + shifted.last) / 2 : authoredCenter;
    const postOffset = postCenter - hatSlotCenter;
    const bodySlotCol = postCenter + 2; // +2 for the renderer-side left pad
    process.stdout.write(
      `${pad(name, 12)}` +
      `bbox=${pad(`${bbox.first}..${bbox.last}`, 5)} ` +
      `w=${pad(bbox.width, 2)} ` +
      `authored-offset=${fmtSigned(authoredOffset)} ` +
      `shift=${fmtShift(result.info.actualShift)} ` +
      `post-offset=${fmtSigned(postOffset)} ` +
      `body-slot-col=${pad(bodySlotCol.toFixed(1), 4)} (body slot-center=8.0)\n`
    );
  }
}

main().catch((err) => {
  process.stderr.write(`[sprite-audit] ${err.stack || err}\n`);
  process.exit(1);
});

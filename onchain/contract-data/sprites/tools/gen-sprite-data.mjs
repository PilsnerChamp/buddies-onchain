#!/usr/bin/env node
// Deterministic generator for onchain/contracts/BuddySpriteData.sol.
//
// Reads onchain/contract-data/sprites/buddies-source.mjs (sibling dir), validates row widths /
// reserved eye sentinel / glyph set, and emits a byte-stable Solidity file. Determinism
// invariant: source fixed -> regeneration is a no-op.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = onchain/contract-data/sprites/tools. Sibling resolve for source; 4 ..s to repo root.
const SOURCE_PATH = resolve(HERE, "..", "buddies-source.mjs");
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const OUT_PATH = resolve(REPO_ROOT, "onchain", "contracts", "BuddySpriteData.sol");

const EXPECTED_SPECIES_COUNT = 18;
const EXPECTED_FRAME_COUNT = 3;
const EXPECTED_ROWS_PER_FRAME = 5;
const EXPECTED_HAT_COUNT = 8;
const EXPECTED_BODY_ROW_BYTES = 17;
const EXPECTED_HAT_ROW_BYTES = 13;

const EYE_PLACEHOLDER = "0";
const EYE_PLACEHOLDER_BYTES = 1;

// Visible-column slot width used by the horizontal centering pass.
// See `docs/onchain/renderer.md` § Horizontal centering. Independent from
// the 17-UTF-8-byte storage rule -- multi-byte glyphs can
// consume multiple bytes per single visible column, so a row's visible
// col count can be <= its byte count.
const SLOT_COLS = 17;

// Allowed glyph set: union of bytes present in today's contract plus the
// reserved eye sentinel. Generator tolerates any printable ASCII plus the specific
// non-ASCII glyphs the art uses (´ ω). Diagnostic errors name the offending
// byte for fast triage.
const ALLOWED_NON_ASCII = new Set([
  "´", // U+00B4 acute accent (duck, cat, blob, axolotl, etc.)
  "ω", // U+03C9 greek small omega (cat mouth)
]);

function isAsciiPrintable(ch) {
  const code = ch.codePointAt(0);
  return code >= 0x20 && code <= 0x7e;
}

// Split a string into "tokens" where each reserved eye sentinel is one token, each space is
// its own "empty" token, and every other codepoint is a single-codepoint
// "glyph" token. Every token occupies exactly one visible column (token =
// visible column; bytes vary per codepoint). See `docs/onchain/renderer.md`
// § Horizontal centering. Bytes per token vary -- space/ASCII/eye sentinel = 1, multi-byte
// codepoints = their UTF-8 length. Row byte total = sum of token.bytes;
// row visible-column total = token count.
function tokenize(row) {
  const tokens = [];
  let i = 0;
  while (i < row.length) {
    if (row.startsWith(EYE_PLACEHOLDER, i)) {
      tokens.push({ kind: "eye", value: EYE_PLACEHOLDER, bytes: EYE_PLACEHOLDER_BYTES });
      i += EYE_PLACEHOLDER.length;
      continue;
    }
    const cp = String.fromCodePoint(row.codePointAt(i));
    const kind = cp === " " ? "space" : "glyph";
    tokens.push({ kind, value: cp, bytes: Buffer.byteLength(cp, "utf8") });
    i += cp.length;
  }
  return tokens;
}

function rowIsBlank(row) {
  for (const t of tokenize(row)) {
    if (t.kind !== "space") return false;
  }
  return true;
}

function computeBodyUsesRow0Bitmap(source) {
  const { SPECIES_ORDER, bodySprites } = source;
  let bitmap = 0;
  for (let i = 0; i < SPECIES_ORDER.length; i++) {
    const frames = bodySprites[SPECIES_ORDER[i]].frames;
    if (frames.some(frame => !rowIsBlank(frame[0]))) {
      bitmap |= (1 << i);
    }
  }
  return bitmap;
}

function countLeading(tokens) {
  let n = 0;
  while (n < tokens.length && tokens[n].kind === "space") n++;
  return n;
}

function countTrailing(tokens) {
  let n = 0;
  while (n < tokens.length && tokens[tokens.length - 1 - n].kind === "space") n++;
  return n;
}

// Compute the desired horizontal shift from frame 0 alone: find the
// visible bbox across all 5 rows and compute how far to move content so
// the bbox sits centered in the 17-column slot. ceil() tie-breaks parity
// one col to the right (right-bias). See `docs/onchain/renderer.md`
// § Horizontal centering.
function computeFrame0Shift(frame0Rows, speciesLabel) {
  let bboxLeft = Infinity;
  let bboxRight = -Infinity;
  for (let ri = 0; ri < frame0Rows.length; ri++) {
    const tokens = tokenize(frame0Rows[ri]);
    for (let ci = 0; ci < tokens.length; ci++) {
      if (tokens[ci].kind !== "space") {
        if (ci < bboxLeft) bboxLeft = ci;
        if (ci > bboxRight) bboxRight = ci;
      }
    }
  }
  if (bboxLeft === Infinity) return { desiredShift: 0, bboxLeft: null, bboxRight: null, bboxWidth: 0, targetLeft: null };
  const bboxWidth = bboxRight - bboxLeft + 1;
  if (bboxWidth > SLOT_COLS) {
    throw new GenError(
      `${speciesLabel} frame 0 visible bbox width ${bboxWidth} exceeds SLOT_COLS ${SLOT_COLS}`
    );
  }
  const targetLeft = Math.ceil((SLOT_COLS - bboxWidth) / 2);
  const desiredShift = targetLeft - bboxLeft;
  return { desiredShift, bboxLeft, bboxRight, bboxWidth, targetLeft };
}

// Apply a horizontal shift to one row. Shift is in visible columns. Moves
// leading-space slots into trailing (shift < 0) or vice versa (shift > 0).
// Preserves the row's content tokens and their relative positions; only
// leading/trailing whitespace changes. Byte total is conserved because
// shifted space bytes are 1 byte/col and leading/trailing swap 1-for-1.
function applyShift(row, shift, label) {
  if (shift === 0) return row;
  const tokens = tokenize(row);
  const leading = countLeading(tokens);
  const trailing = countTrailing(tokens);
  // Don't touch all-space rows (nothing to shift; conservation is trivial).
  if (leading === tokens.length) return row;
  if (shift > 0 && trailing < shift) {
    throw new GenError(
      `${label} cannot shift right by ${shift}: only ${trailing} trailing spaces available (row "${row}")`
    );
  }
  if (shift < 0 && leading < -shift) {
    throw new GenError(
      `${label} cannot shift left by ${-shift}: only ${leading} leading spaces available (row "${row}")`
    );
  }
  const content = tokens.slice(leading, tokens.length - trailing);
  const newLeading = leading + shift;
  const newTrailing = trailing - shift;
  const parts = [];
  for (let i = 0; i < newLeading; i++) parts.push(" ");
  for (const t of content) parts.push(t.value);
  for (let i = 0; i < newTrailing; i++) parts.push(" ");
  return parts.join("");
}

// Compute the desired shift from frame 0 and apply that exact shared shift
// to every row of frames 0/1/2. If any later frame cannot absorb the same
// move, applyShift() fails loudly so the art must be fixed instead of the
// generator silently clamping away from frame 0's ideal center.
function centerSpecies(name, frames) {
  const f0 = computeFrame0Shift(frames[0], name);
  const desired = f0.desiredShift;
  const shifted = frames.map((frame, fi) =>
    frame.map((row, ri) => applyShift(row, desired, `${name} frame ${fi} row ${ri}`))
  );
  for (let fi = 0; fi < shifted.length; fi++) {
    for (let ri = 0; ri < shifted[fi].length; ri++) {
      const bytes = Buffer.byteLength(shifted[fi][ri], "utf8");
      if (bytes !== EXPECTED_BODY_ROW_BYTES) {
        throw new GenError(
          `${name} frame ${fi} row ${ri} is ${bytes} UTF-8 bytes after shift ${desired} (generator bug: exact frame-0 shift should preserve row width)`
        );
      }
    }
  }
  return {
    frames: shifted,
    info: {
      desiredShift: desired,
      actualShift: desired,
      bboxLeft: f0.bboxLeft,
      bboxRight: f0.bboxRight,
      bboxWidth: f0.bboxWidth,
    },
  };
}

function validateGlyph(row, speciesLabel, frameIdx, rowIdx) {
  let byteOffset = 0;
  for (const tok of tokenize(row)) {
    if (tok.kind === "eye") { byteOffset += tok.bytes; continue; }
    const ch = tok.value;
    if (isAsciiPrintable(ch)) { byteOffset += tok.bytes; continue; }
    if (ALLOWED_NON_ASCII.has(ch)) { byteOffset += tok.bytes; continue; }
    const cpHex = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
    throw new GenError(
      `disallowed glyph "${ch}" (U+${cpHex}) at ${speciesLabel} frame ${frameIdx} row ${rowIdx} byte-offset ${byteOffset}`
    );
  }
}

class GenError extends Error {}

function validate(source) {
  const { BODY_ROW_WIDTH, HAT_ROW_WIDTH, FRAMES_PER_SPECIES, ROWS_PER_FRAME, SPECIES_ORDER, HAT_ORDER, bodySprites, hats } = source;

  if (BODY_ROW_WIDTH !== EXPECTED_BODY_ROW_BYTES)
    throw new GenError(`BODY_ROW_WIDTH must be ${EXPECTED_BODY_ROW_BYTES}, got ${BODY_ROW_WIDTH}`);
  if (HAT_ROW_WIDTH !== EXPECTED_HAT_ROW_BYTES)
    throw new GenError(`HAT_ROW_WIDTH must be ${EXPECTED_HAT_ROW_BYTES}, got ${HAT_ROW_WIDTH}`);
  if (FRAMES_PER_SPECIES !== EXPECTED_FRAME_COUNT)
    throw new GenError(`FRAMES_PER_SPECIES must be ${EXPECTED_FRAME_COUNT}, got ${FRAMES_PER_SPECIES}`);
  if (ROWS_PER_FRAME !== EXPECTED_ROWS_PER_FRAME)
    throw new GenError(`ROWS_PER_FRAME must be ${EXPECTED_ROWS_PER_FRAME}, got ${ROWS_PER_FRAME}`);

  if (!Array.isArray(SPECIES_ORDER) || SPECIES_ORDER.length !== EXPECTED_SPECIES_COUNT)
    throw new GenError(`SPECIES_ORDER must have ${EXPECTED_SPECIES_COUNT} entries, got ${SPECIES_ORDER?.length}`);
  if (!Array.isArray(HAT_ORDER) || HAT_ORDER.length !== EXPECTED_HAT_COUNT)
    throw new GenError(`HAT_ORDER must have ${EXPECTED_HAT_COUNT} entries, got ${HAT_ORDER?.length}`);

  const speciesSeen = new Set();
  for (const name of SPECIES_ORDER) {
    if (typeof name !== "string" || !name.length)
      throw new GenError(`SPECIES_ORDER contains non-string or empty entry: ${JSON.stringify(name)}`);
    if (speciesSeen.has(name)) throw new GenError(`SPECIES_ORDER has duplicate entry "${name}"`);
    speciesSeen.add(name);
    if (!Object.prototype.hasOwnProperty.call(bodySprites, name))
      throw new GenError(`bodySprites is missing key "${name}" declared in SPECIES_ORDER`);
  }
  for (const key of Object.keys(bodySprites)) {
    if (!speciesSeen.has(key))
      throw new GenError(`bodySprites has orphan key "${key}" not in SPECIES_ORDER`);
  }

  const hatSeen = new Set();
  for (const name of HAT_ORDER) {
    if (typeof name !== "string" || !name.length)
      throw new GenError(`HAT_ORDER contains non-string or empty entry: ${JSON.stringify(name)}`);
    if (hatSeen.has(name)) throw new GenError(`HAT_ORDER has duplicate entry "${name}"`);
    hatSeen.add(name);
    if (!Object.prototype.hasOwnProperty.call(hats, name))
      throw new GenError(`hats is missing key "${name}" declared in HAT_ORDER`);
  }
  for (const key of Object.keys(hats)) {
    if (!hatSeen.has(key))
      throw new GenError(`hats has orphan key "${key}" not in HAT_ORDER`);
  }

  for (const name of SPECIES_ORDER) {
    const entry = bodySprites[name];
    if (!entry || !Array.isArray(entry.frames))
      throw new GenError(`bodySprites["${name}"] must be { frames: [...] }`);
    if (entry.frames.length !== FRAMES_PER_SPECIES)
      throw new GenError(`bodySprites["${name}"].frames length must be ${FRAMES_PER_SPECIES}, got ${entry.frames.length}`);
    for (let fi = 0; fi < entry.frames.length; fi++) {
      const frame = entry.frames[fi];
      if (!Array.isArray(frame) || frame.length !== ROWS_PER_FRAME)
        throw new GenError(`bodySprites["${name}"].frames[${fi}] must have ${ROWS_PER_FRAME} rows, got ${frame?.length}`);
      for (let ri = 0; ri < frame.length; ri++) {
        const row = frame[ri];
        if (typeof row !== "string")
          throw new GenError(`bodySprites["${name}"].frames[${fi}][${ri}] must be string`);
        const bytes = Buffer.byteLength(row, "utf8");
        if (bytes !== BODY_ROW_WIDTH)
          throw new GenError(
            `${name} frame ${fi} row ${ri} has ${bytes} UTF-8 bytes, expected ${BODY_ROW_WIDTH}: ${JSON.stringify(row)}`
          );
        validateGlyph(row, name, fi, ri);
      }
    }
  }

  for (const name of HAT_ORDER) {
    const row = hats[name];
    if (typeof row !== "string")
      throw new GenError(`hats["${name}"] must be string`);
    const bytes = Buffer.byteLength(row, "utf8");
    if (bytes !== HAT_ROW_WIDTH)
      throw new GenError(`hat "${name}" has ${bytes} UTF-8 bytes, expected ${HAT_ROW_WIDTH}: ${JSON.stringify(row)}`);
    if (row.includes(EYE_PLACEHOLDER))
      throw new GenError(
        `hat "${name}" contains reserved eye sentinel "${EYE_PLACEHOLDER}"; hats must not carry eye tokens`
      );
    validateGlyph(row, `hat:${name}`, 0, 0);
  }
}

function solidityEscape(row) {
  // Escape only the two sequences the Solidity unicode""" literal cannot
  // carry verbatim: backslash and double quote. Bytes are preserved exactly
  // so the on-chain blob matches authored source byte-for-byte.
  return row.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Center a single hat row inside its 13-byte slot using the same bbox +
// ceil math as bodies. See `docs/onchain/renderer.md` § Hat composition.
// No feasibility clamp: hats have no inter-frame constraint and every
// authored hat has enough slack for its target shift. The eye sentinel is forbidden
// inside hat data and rejected at validation time.
function centerHat(name, row) {
  const tokens = tokenize(row);
  let bboxLeft = Infinity;
  let bboxRight = -Infinity;
  for (let ci = 0; ci < tokens.length; ci++) {
    if (tokens[ci].kind !== "space") {
      if (ci < bboxLeft) bboxLeft = ci;
      if (ci > bboxRight) bboxRight = ci;
    }
  }
  if (bboxLeft === Infinity) {
    // all-space hat (e.g. "none") needs no shift
    return { row, info: { desiredShift: 0, actualShift: 0, bboxLeft: null, bboxRight: null, bboxWidth: 0 } };
  }
  const bboxWidth = bboxRight - bboxLeft + 1;
  if (bboxWidth > EXPECTED_HAT_ROW_BYTES) {
    throw new GenError(`hat "${name}" visible bbox width ${bboxWidth} exceeds HAT_ROW_WIDTH ${EXPECTED_HAT_ROW_BYTES}`);
  }
  const targetLeft = Math.ceil((EXPECTED_HAT_ROW_BYTES - bboxWidth) / 2);
  const shift = targetLeft - bboxLeft;
  const shifted = applyShift(row, shift, `hat:${name}`);
  const bytes = Buffer.byteLength(shifted, "utf8");
  if (bytes !== EXPECTED_HAT_ROW_BYTES) {
    throw new GenError(
      `hat "${name}" is ${bytes} UTF-8 bytes after shift ${shift}, expected ${EXPECTED_HAT_ROW_BYTES} (generator bug: hats have no clamp)`
    );
  }
  return { row: shifted, info: { desiredShift: shift, actualShift: shift, bboxLeft, bboxRight, bboxWidth, targetLeft } };
}

function centerAllHats(source) {
  const { HAT_ORDER, hats } = source;
  const rows = {};
  const infos = {};
  for (const name of HAT_ORDER) {
    const result = centerHat(name, hats[name]);
    rows[name] = result.row;
    infos[name] = result.info;
  }
  return { rows, infos };
}

// Compute the shifted frames for every species and collect per-species
// centering info. Callers (render + CLI reporter) consume both.
function centerAllSpecies(source) {
  const { SPECIES_ORDER, bodySprites } = source;
  const frames = {};
  const infos = {};
  for (const name of SPECIES_ORDER) {
    const result = centerSpecies(name, bodySprites[name].frames);
    frames[name] = result.frames;
    infos[name] = result.info;
  }
  return { frames, infos };
}

function renderContract(source, centeredFrames, centeredHats) {
  const { SPECIES_ORDER, HAT_ORDER } = source;
  const INDENT = "        ";
  const bodyUsesRow0Bitmap = computeBodyUsesRow0Bitmap(source);
  const bodyUsesRow0Hex = `0x00${bodyUsesRow0Bitmap.toString(16).toUpperCase().padStart(6, "0")}`;
  const lines = [];
  lines.push("// SPDX-License-Identifier: MIT");
  lines.push("pragma solidity ^0.8.24;");
  lines.push("");
  lines.push("/// @title BuddySpriteData");
  lines.push("/// @notice Fixed-width packed sprite corpus for the Buddies Onchain renderer.");
  lines.push("/// @dev Body rows are stored species-major, then frame-major, then row-major.");
  lines.push("///      Hat rows follow canonical hat enum order and all rows are right-padded with spaces.");
  lines.push("///      Generated from onchain/contract-data/sprites/buddies-source.mjs by onchain/contract-data/sprites/tools/gen-sprite-data.mjs. Do not edit by hand.");
  lines.push("contract BuddySpriteData {");
  lines.push("    uint8 private constant SPECIES_COUNT = 18;");
  lines.push("    uint8 private constant FRAME_COUNT = 3;");
  lines.push("    uint8 private constant ROWS_PER_FRAME = 5;");
  lines.push("    uint8 private constant HAT_COUNT = 8;");
  lines.push("    uint8 private constant BODY_ROW_WIDTH = 17;");
  lines.push("    uint8 private constant HAT_ROW_WIDTH = 13;");
  lines.push(`    uint32 private constant BODY_USES_ROW_0 = ${bodyUsesRow0Hex};`);
  lines.push("");
  lines.push("    error InvalidBodyIndex();");
  lines.push("    error InvalidHatIndex();");
  lines.push("");
  lines.push("    bytes private constant BODY_DATA =");

  const bodyRowLines = [];
  for (const name of SPECIES_ORDER) {
    bodyRowLines.push(`${INDENT}// ${name}`);
    const frames = centeredFrames[name];
    for (let fi = 0; fi < frames.length; fi++) {
      bodyRowLines.push(`${INDENT}// frame ${fi}`);
      for (const row of frames[fi]) {
        bodyRowLines.push(`${INDENT}unicode"${solidityEscape(row)}"`);
      }
    }
  }
  // terminate body block with trailing ; on the final literal
  for (let i = 0; i < bodyRowLines.length; i++) {
    const isLast = i === bodyRowLines.length - 1;
    lines.push(bodyRowLines[i] + (isLast ? ";" : ""));
  }
  lines.push("");

  lines.push("    bytes private constant HAT_DATA =");
  const hatLines = [];
  for (const name of HAT_ORDER) {
    hatLines.push(`${INDENT}// ${name}`);
    hatLines.push(`${INDENT}unicode"${solidityEscape(centeredHats[name])}"`);
  }
  for (let i = 0; i < hatLines.length; i++) {
    const isLast = i === hatLines.length - 1;
    lines.push(hatLines[i] + (isLast ? ";" : ""));
  }
  lines.push("");

  lines.push("    function getBodyRow(uint8 species, uint8 frame, uint8 row) external pure returns (string memory) {");
  lines.push("        if (species >= SPECIES_COUNT || frame >= FRAME_COUNT || row >= ROWS_PER_FRAME) {");
  lines.push("            revert InvalidBodyIndex();");
  lines.push("        }");
  lines.push("");
  lines.push("        uint256 rowIndex = uint256(species) * uint256(FRAME_COUNT) * uint256(ROWS_PER_FRAME)");
  lines.push("            + uint256(frame) * uint256(ROWS_PER_FRAME) + uint256(row);");
  lines.push("");
  lines.push("        return _slice(BODY_DATA, rowIndex * uint256(BODY_ROW_WIDTH), BODY_ROW_WIDTH);");
  lines.push("    }");
  lines.push("");
  lines.push("    function bodyUsesRow0(uint8 species) external pure returns (bool) {");
  lines.push("        if (species >= SPECIES_COUNT) {");
  lines.push("            revert InvalidBodyIndex();");
  lines.push("        }");
  lines.push("");
  lines.push("        return ((BODY_USES_ROW_0 >> species) & 1) == 1;");
  lines.push("    }");
  lines.push("");
  lines.push("    function getHatRow(uint8 hat) external pure returns (string memory) {");
  lines.push("        if (hat >= HAT_COUNT) {");
  lines.push("            revert InvalidHatIndex();");
  lines.push("        }");
  lines.push("");
  lines.push("        return _slice(HAT_DATA, uint256(hat) * uint256(HAT_ROW_WIDTH), HAT_ROW_WIDTH);");
  lines.push("    }");
  lines.push("");
  lines.push("    function _slice(bytes memory data, uint256 offset, uint256 width) private pure returns (string memory) {");
  lines.push("        bytes memory row = new bytes(width);");
  lines.push("");
  lines.push("        for (uint256 i = 0; i < width; ++i) {");
  lines.push("            row[i] = data[offset + i];");
  lines.push("        }");
  lines.push("");
  lines.push("        return string(row);");
  lines.push("    }");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function selfCheck() {
  // Fixtures run before any source I/O. Any failure aborts with non-zero.
  const cases = [
    { row: "                 ", expect: true, desc: "17-byte ASCII blank" },
    { row: "  <(0 )___       ", expect: true, desc: "17-byte row with reserved eye sentinel" },
    { row: "    `--´        ",  expect: true, desc: "17-byte row with multi-byte ´" },
    { row: "    `--´       ",   expect: false, desc: "16-byte row (one short)" },
    { row: "    `--´         ", expect: false, desc: "18-byte row (one long)" },
    { row: "} and { survive  ", expect: true, desc: "lone braces are literal glyphs" },
  ];
  for (const c of cases) {
    const bytes = Buffer.byteLength(c.row, "utf8");
    const ok = bytes === EXPECTED_BODY_ROW_BYTES;
    if (ok !== c.expect) {
      throw new GenError(`self-check failed: "${c.desc}" expected ok=${c.expect} but got bytes=${bytes}`);
    }
  }
  // glyph diagnostic format
  try {
    validateGlyph("\u2603 snowman        ", "fixture", 0, 0);
    throw new GenError("self-check failed: disallowed glyph was not rejected");
  } catch (e) {
    if (!(e instanceof GenError) || !/disallowed glyph/.test(e.message)) throw e;
  }
  // eye-sentinel byte accounting fixture
  const t = tokenize("  <(0 )___       ");
  const sum = t.reduce((a, x) => a + x.bytes, 0);
  if (sum !== EXPECTED_BODY_ROW_BYTES) {
    throw new GenError(`self-check failed: tokenize byte-sum ${sum} != ${EXPECTED_BODY_ROW_BYTES}`);
  }
  // computeBodyUsesRow0Bitmap fixture: 4 species, indices 1 and 3 use row 0.
  const fakeSource = {
    SPECIES_ORDER: ["a", "b", "c", "d"],
    bodySprites: {
      a: { frames: [["    ", "  X "], ["    ", "  X "], ["    ", "  X "]] },
      b: { frames: [["    ", "  X "], ["    ", "  X "], [" X  ", "  X "]] },
      c: { frames: [["    ", "  X "], ["    ", "  X "], ["    ", "  X "]] },
      d: { frames: [[" X  ", "  X "], ["    ", "  X "], ["    ", "  X "]] },
    },
  };
  const expectedBitmap = 0b1010;
  const actualBitmap = computeBodyUsesRow0Bitmap(fakeSource);
  if (actualBitmap !== expectedBitmap) {
    throw new GenError(
      `self-check failed: bitmap expected 0b${expectedBitmap.toString(2)}, got 0b${actualBitmap.toString(2)}`
    );
  }
  // Centering fixtures: bbox math, shift application, conservation of byte
  // total, ceil() tie-break bias to the right.
  const ffx = [
    "                 ",
    "    __           ",
    "  <(0 )___       ",
    "   (  ._>        ",
    "    `--\u00b4        ",
  ];
  const info = computeFrame0Shift(ffx, "fixture");
  if (info.bboxLeft !== 2 || info.bboxRight !== 9) {
    throw new GenError(`self-check failed: expected bbox cols 2..9, got ${info.bboxLeft}..${info.bboxRight}`);
  }
  // bboxWidth = 8, targetLeft = ceil((17 - 8) / 2) = 5, desiredShift = 5 - 2 = 3.
  if (info.desiredShift !== 3) {
    throw new GenError(`self-check failed: expected desiredShift 3, got ${info.desiredShift}`);
  }
  const shifted = ffx.map((r, i) => applyShift(r, info.desiredShift, `fixture row ${i}`));
  for (let i = 0; i < shifted.length; i++) {
    const b = Buffer.byteLength(shifted[i], "utf8");
    if (b !== EXPECTED_BODY_ROW_BYTES) {
      throw new GenError(`self-check failed: shifted row ${i} is ${b} bytes, expected ${EXPECTED_BODY_ROW_BYTES}`);
    }
  }
  // Odd bbox width -> ceil tie-break biases right by 1 slot.
  const oddFrame = [
    "     XXX         ",
    "                 ",
    "                 ",
    "                 ",
    "                 ",
  ];
  const oddInfo = computeFrame0Shift(oddFrame, "odd");
  // bbox 5..7, width 3; targetLeft = ceil((17-3)/2) = 7; desiredShift = 7-5 = 2.
  if (oddInfo.desiredShift !== 2) {
    throw new GenError(`self-check failed: odd-width ceil tie-break expected desiredShift 2, got ${oddInfo.desiredShift}`);
  }
  // Exact frame-0 centering: a later frame that cannot absorb the same
  // right shift must fail loudly instead of being clamped.
  const impossibleFrames = [
    ["                 ", "  XXX            ", "                 ", "                 ", "                 "],
    ["                 ", "XXXXXXXXXXXXXXXX ", "                 ", "                 ", "                 "],
    ["                 ", "  XXX            ", "                 ", "                 ", "                 "],
  ];
  let threw = false;
  try { centerSpecies("exact-shift-fixture", impossibleFrames); } catch (e) { threw = true; }
  if (!threw) throw new GenError("self-check failed: centerSpecies did not reject impossible shared shift");
  // Overflow at the row level: shifting past available trailing spaces must fail loudly.
  threw = false;
  try { applyShift("X                ", 100, "overflow"); } catch (e) { threw = true; }
  if (!threw) throw new GenError("self-check failed: applyShift did not reject impossible shift");
}

async function loadSource() {
  const url = pathToFileURL(SOURCE_PATH).href + `?t=${Date.now()}`;
  return await import(url);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    check: args.includes("--check"),
    dryRun: args.includes("--dry-run"),
  };
}

async function main() {
  const { check, dryRun } = parseArgs(process.argv);
  selfCheck();
  const source = await loadSource();
  validate(source);
  const { frames: centeredFrames, infos: centeringInfos } = centerAllSpecies(source);
  const { rows: centeredHats, infos: hatCenteringInfos } = centerAllHats(source);
  const rendered = renderContract(source, centeredFrames, centeredHats);

  if (dryRun) {
    process.stdout.write(rendered);
    return;
  }

  const hatReport = summarizeHatCentering(hatCenteringInfos);
  if (hatReport) process.stderr.write(hatReport);

  if (check) {
    let existing = "";
    try { existing = readFileSync(OUT_PATH, "utf8"); } catch (_) { /* missing */ }
    if (existing !== rendered) {
      process.stderr.write(`[gen-sprite-data] drift: ${OUT_PATH} does not match source\n`);
      process.exit(1);
    }
    process.stdout.write(`[gen-sprite-data] ${OUT_PATH} matches source (no-op)\n`);
    return;
  }

  writeFileSync(OUT_PATH, rendered);
  process.stdout.write(`[gen-sprite-data] wrote ${OUT_PATH} (${rendered.length} bytes)\n`);
}

function fmtShift(n) {
  if (n === 0) return "+0";
  return n > 0 ? `+${n}` : `${n}`;
}

function summarizeHatCentering(infos) {
  const shifted = Object.entries(infos).filter(([, info]) => info.actualShift !== 0);
  if (shifted.length === 0) return null;
  const rows = shifted.map(([name, info]) => {
    return `  ${name.padEnd(10)} bbox=${info.bboxLeft}..${info.bboxRight} w=${info.bboxWidth} shift=${fmtShift(info.actualShift)}`;
  });
  return (
    `[gen-sprite-data] ${shifted.length}/${Object.keys(infos).length} hats shifted to slot-center:\n` +
    rows.join("\n") +
    "\n"
  );
}

// Only run the CLI when this file is invoked directly. Sibling tools
// (sprite-audit) import helpers above without triggering a contract write.
const invokedAsCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsCli) {
  main().catch((err) => {
    process.stderr.write(`[gen-sprite-data] ${err instanceof GenError ? err.message : (err.stack || err)}\n`);
    process.exit(1);
  });
}

export {
  tokenize,
  countLeading,
  countTrailing,
  computeFrame0Shift,
  centerSpecies,
  centerHat,
  SLOT_COLS,
};

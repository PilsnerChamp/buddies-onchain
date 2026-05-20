// onchain/contract-data/sprites/buddies-source.mjs
//
// Single JS-side source of truth for all Buddies Onchain sprite and trait display data.
// Mirrors the on-chain enums, labels, and display constants from BuddyRenderer.sol and
// Mulberry32.sol so JS consumers (plugin, landing page, tools) never redefine them.
//
// Sprite rows are pre-centered; the generator centering pass is a no-op.
// Runtime source of truth for emitted sprite bytes is onchain/contracts/BuddySpriteData.sol,
// generated from this file via onchain/contract-data/sprites/tools/gen-sprite-data.mjs.
// Row width rule: every body row is exactly 17 UTF-8 bytes; every hat row is 13 UTF-8 bytes.
// Eye placeholder uses the literal single-byte "0" sentinel inside body rows and is
// substituted at render time by BuddyRenderer.sol.

// ---------------------------------------------------------------------------
// Sprite grid dimensions
// ---------------------------------------------------------------------------

export const BODY_ROW_WIDTH = 17;
export const HAT_ROW_WIDTH = 13;
export const FRAMES_PER_SPECIES = 3;
export const ROWS_PER_FRAME = 5;

// ---------------------------------------------------------------------------
// Enum arrays — index = on-chain uint8 value
// ---------------------------------------------------------------------------

export const SPECIES_ORDER = [
  "duck",
  "goose",
  "blob",
  "cat",
  "dragon",
  "octopus",
  "owl",
  "penguin",
  "turtle",
  "snail",
  "ghost",
  "axolotl",
  "capybara",
  "cactus",
  "robot",
  "rabbit",
  "mushroom",
  "chonk",
];

export const HAT_ORDER = [
  "none",
  "crown",
  "tophat",
  "propeller",
  "halo",
  "wizard",
  "beanie",
  "tinyduck",
];

export const EYES = ["\u00b7", "\u2726", "\u00d7", "\u25c9", "@", "\u00b0"];

// Human-readable labels parallel to EYES — used as the `Eyes` attribute value
// in on-chain ERC-721 metadata. Glyphs above stay in the SVG; labels travel
// with the JSON so marketplaces show "Star" instead of a bare "✦" codepoint.
// Index alignment with EYES is enforced by BuddyRenderer._eyeLabel.
export const EYE_LABELS = ["Dot", "Star", "Cross", "Bullseye", "Spiral", "Ring"];

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];

export const STAT_NAMES = ["debugging", "patience", "chaos", "wisdom", "snark"];

export const STAGES = ["hatched", "bonded"];

// ---------------------------------------------------------------------------
// Rarity metadata
// ---------------------------------------------------------------------------

// Weighted roll buckets — sum = 100, matching Mulberry32._rollRarity thresholds.
export const RARITY_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

// Base stat floor per rarity — matching Mulberry32._statBase.
export const STAT_FLOORS = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

// Star strings per rarity — from original Claude Code types.ts.
export const RARITY_STARS = {
  common: "\u2605",
  uncommon: "\u2605\u2605",
  rare: "\u2605\u2605\u2605",
  epic: "\u2605\u2605\u2605\u2605",
  legendary: "\u2605\u2605\u2605\u2605\u2605",
};

// Theme-key color mapping per rarity — from original Claude Code types.ts.
// Keys reference the Claude Code Theme type (inactive = gray, success = green,
// permission = blue, autoAccept = violet, warning = amber).
export const RARITY_THEME_KEYS = {
  common: "inactive",
  uncommon: "success",
  rare: "permission",
  epic: "autoAccept",
  legendary: "warning",
};

// Rarity colors — resolved from the Claude Code theme system.
// Original uses a single flat foreground tint per rarity for all sprite text.
// No per-species colors; no background colors; shiny has no visual effect in the original.
export const RARITY_COLORS = {
  common:    { dark: "#999999", light: "#666666", ansi: "blackBright" },
  uncommon:  { dark: "#4EBA65", light: "#2C7A39", ansi: "green" },
  rare:      { dark: "#B1B9F9", light: "#576FF7", ansi: "blue" },
  epic:      { dark: "#AF87FF", light: "#8700FF", ansi: "magenta" },
  legendary: { dark: "#FFC107", light: "#966C1E", ansi: "yellow" },
};

// ---------------------------------------------------------------------------
// Chrome font — Iosevka SemiBold (.stat CSS class)
// ---------------------------------------------------------------------------

export const FONT = {
  family: "Iosevka",
  weight: "SemiBold",
  version: "34.3.0",
  license: "OFL-1.1",
  subset: "contract-data/fonts/chrome/BuddyFont.woff2",
  manifest: "contract-data/fonts/chrome/BuddyFont.manifest.json",
  glyphCount: 65,
  metrics: {
    fontSize: 24,
    glyphAdvance: 12.0,
    ascent: 23.16,
    descent: 5.16,
    lineHeight: 30.0,
  },
};

// ---------------------------------------------------------------------------
// Sprite font — DejaVu Sans Mono (.sprite CSS class)
// ---------------------------------------------------------------------------

export const SPRITE_FONT = {
  family: "DejaVu Sans Mono",
  weight: "Regular",
  license: "Bitstream Vera / DejaVu",
  subset: "contract-data/fonts/sprite/BuddySpriteFont.woff2",
  manifest: "contract-data/fonts/sprite/BuddySpriteFont.manifest.json",
  glyphCount: 38,
  metrics: {
    upem: 2048,
    advance: 1233,
    ascent: 1901,   // hhea.ascent
    descent: 483,   // |hhea.descent|
  },
};

// ---------------------------------------------------------------------------
// Chrome rail vocabulary
// Codepoints rendered by the .stat CSS class beyond the label strings.
// ---------------------------------------------------------------------------

export const STAT_ABBREVS = ["DBG", "PAT", "CHA", "WIS", "SNK"];
export const RAIL_PROMPT = "> /buddy-onchain";
export const SHINY_LABEL = "SHINY";
export const HEADER_SEPARATOR = "\u00b7"; // · (middle dot, also eye glyph 0)
export const RAIL_SEPARATOR = "\u2502"; // │ (box drawing vertical)
export const RAIL_RULE_CHAR = "\u2500"; // ─ (box drawing horizontal)
export const SHINY_DECORATOR = "\u2726"; // ✦ (in chrome title, not sprite eye)

// ---------------------------------------------------------------------------
// Body sprites — 18 species x 3 frames x 5 rows x 17 UTF-8 bytes
// ---------------------------------------------------------------------------

export const bodySprites = {
  duck: {
    frames: [
      [
        "                 ",
        "       __        ",
        "     <(0 )___    ",
        "      (  ._>     ",
        "       `--\u00b4     ",
      ],
      [
        "                 ",
        "       __        ",
        "     <(0 )___    ",
        "      (  ._>     ",
        "       `--\u00b4~    ",
      ],
      [
        "                 ",
        "       __        ",
        "     <(0 )___    ",
        "      (  .__>    ",
        "       `--\u00b4     ",
      ],
    ],
  },
  goose: {
    frames: [
      [
        "                 ",
        "        (0>      ",
        "        ||       ",
        "      _(__)_     ",
        "       ^^^^      ",
      ],
      [
        "                 ",
        "       (0>       ",
        "        ||       ",
        "      _(__)_     ",
        "       ^^^^      ",
      ],
      [
        "                 ",
        "        (0>>     ",
        "        ||       ",
        "      _(__)_     ",
        "       ^^^^      ",
      ],
    ],
  },
  blob: {
    frames: [
      [
        "                 ",
        "      .----.     ",
        "     ( 0  0 )    ",
        "     (      )    ",
        "      `----\u00b4    ",
      ],
      [
        "                 ",
        "     .------.    ",
        "    (  0  0  )   ",
        "    (        )   ",
        "     `------\u00b4   ",
      ],
      [
        "                 ",
        "       .--.      ",
        "      (0  0)     ",
        "      (    )     ",
        "       `--\u00b4     ",
      ],
    ],
  },
  cat: {
    frames: [
      [
        "                 ",
        "      /\\_/\\      ",
        "     ( 0   0)    ",
        "     (  \u03c9  )    ",
        "     (\")_(\")     ",
      ],
      [
        "                 ",
        "      /\\_/\\      ",
        "     ( 0   0)    ",
        "     (  \u03c9  )    ",
        "     (\")_(\")~    ",
      ],
      [
        "                 ",
        "      /\\-/\\      ",
        "     ( 0   0)    ",
        "     (  \u03c9  )    ",
        "     (\")_(\")     ",
      ],
    ],
  },
  dragon: {
    frames: [
      [
        "                 ",
        "     /^\\  /^\\    ",
        "    <  0  0  >   ",
        "    (   ~~   )   ",
        "     `-vvvv-\u00b4   ",
      ],
      [
        "                 ",
        "     /^\\  /^\\    ",
        "    <  0  0  >   ",
        "    (        )   ",
        "     `-vvvv-\u00b4   ",
      ],
      [
        "      ~    ~     ",
        "     /^\\  /^\\    ",
        "    <  0  0  >   ",
        "    (   ~~   )   ",
        "     `-vvvv-\u00b4   ",
      ],
    ],
  },
  octopus: {
    frames: [
      [
        "                 ",
        "      .----.     ",
        "     ( 0  0 )    ",
        "     (______)    ",
        "     /\\/\\/\\/\\    ",
      ],
      [
        "                 ",
        "      .----.     ",
        "     ( 0  0 )    ",
        "     (______)    ",
        "     \\/\\/\\/\\/    ",
      ],
      [
        "        o        ",
        "      .----.     ",
        "     ( 0  0 )    ",
        "     (______)    ",
        "     /\\/\\/\\/\\    ",
      ],
    ],
  },
  owl: {
    frames: [
      [
        "                 ",
        "      /\\  /\\     ",
        "     ((0)(0))    ",
        "     (  ><  )    ",
        "      `----\u00b4    ",
      ],
      [
        "                 ",
        "      /\\  /\\     ",
        "     ((0)(0))    ",
        "     (  ><  )    ",
        "      .----.     ",
      ],
      [
        "                 ",
        "      /\\  /\\     ",
        "     ((0)(-))    ",
        "     (  ><  )    ",
        "      `----\u00b4    ",
      ],
    ],
  },
  penguin: {
    frames: [
      [
        "                 ",
        "      .---.      ",
        "      (0>0)      ",
        "     /(   )\\     ",
        "      `---\u00b4     ",
      ],
      [
        "                 ",
        "      .---.      ",
        "      (0>0)      ",
        "     |(   )|     ",
        "      `---\u00b4     ",
      ],
      [
        "      .---.      ",
        "      (0>0)      ",
        "     /(   )\\     ",
        "      `---\u00b4     ",
        "       ~ ~       ",
      ],
    ],
  },
  turtle: {
    frames: [
      [
        "                 ",
        "      _,--._     ",
        "     ( 0  0 )    ",
        "    /[______]\\   ",
        "     ``    ``    ",
      ],
      [
        "                 ",
        "      _,--._     ",
        "     ( 0  0 )    ",
        "    /[______]\\   ",
        "      ``  ``     ",
      ],
      [
        "                 ",
        "      _,--._     ",
        "     ( 0  0 )    ",
        "    /[======]\\   ",
        "     ``    ``    ",
      ],
    ],
  },
  snail: {
    frames: [
      [
        "                 ",
        "    0    .--.    ",
        "     \\  ( @ )    ",
        "      \\_`--\u00b4    ",
        "     ~~~~~~~     ",
      ],
      [
        "                 ",
        "     0   .--.    ",
        "     |  ( @ )    ",
        "      \\_`--\u00b4    ",
        "     ~~~~~~~     ",
      ],
      [
        "                 ",
        "    0    .--.    ",
        "     \\  ( @  )   ",
        "      \\_`--\u00b4    ",
        "      ~~~~~~     ",
      ],
    ],
  },
  ghost: {
    frames: [
      [
        "                 ",
        "      .----.     ",
        "     / 0  0 \\    ",
        "     |      |    ",
        "     ~`~``~`~    ",
      ],
      [
        "                 ",
        "      .----.     ",
        "     / 0  0 \\    ",
        "     |      |    ",
        "     `~`~~`~`    ",
      ],
      [
        "       ~  ~      ",
        "      .----.     ",
        "     / 0  0 \\    ",
        "     |      |    ",
        "     ~~`~~`~~    ",
      ],
    ],
  },
  axolotl: {
    frames: [
      [
        "                 ",
        "   }~(______)~{  ",
        "   }~(0 .. 0)~{  ",
        "     ( .--. )    ",
        "     (_/  \\_)    ",
      ],
      [
        "                 ",
        "   ~}(______){~  ",
        "   ~}(0 .. 0){~  ",
        "     ( .--. )    ",
        "     (_/  \\_)    ",
      ],
      [
        "                 ",
        "   }~(______)~{  ",
        "   }~(0 .. 0)~{  ",
        "     (  --  )    ",
        "     ~_/  \\_~    ",
      ],
    ],
  },
  capybara: {
    frames: [
      [
        "                 ",
        "     n______n    ",
        "    ( 0    0 )   ",
        "    (   oo   )   ",
        "     `------\u00b4   ",
      ],
      [
        "                 ",
        "     n______n    ",
        "    ( 0    0 )   ",
        "    (   Oo   )   ",
        "     `------\u00b4   ",
      ],
      [
        "       ~  ~      ",
        "     u______n    ",
        "    ( 0    0 )   ",
        "    (   oo   )   ",
        "     `------\u00b4   ",
      ],
    ],
  },
  cactus: {
    frames: [
      [
        "                 ",
        "    n  ____  n   ",
        "    | |0  0| |   ",
        "    |_|    |_|   ",
        "      |    |     ",
      ],
      [
        "                 ",
        "       ____      ",
        "    n |0  0| n   ",
        "    |_|    |_|   ",
        "      |    |     ",
      ],
      [
        "    n        n   ",
        "    |  ____  |   ",
        "    | |0  0| |   ",
        "    |_|    |_|   ",
        "      |    |     ",
      ],
    ],
  },
  robot: {
    frames: [
      [
        "                 ",
        "      .[||].     ",
        "     [ 0  0 ]    ",
        "     [ ==== ]    ",
        "     `------\u00b4   ",
      ],
      [
        "                 ",
        "      .[||].     ",
        "     [ 0  0 ]    ",
        "     [ -==- ]    ",
        "     `------\u00b4   ",
      ],
      [
        "        *        ",
        "      .[||].     ",
        "     [ 0  0 ]    ",
        "     [ ==== ]    ",
        "     `------\u00b4   ",
      ],
    ],
  },
  rabbit: {
    frames: [
      [
        "                 ",
        "      (\\__/)     ",
        "     ( 0  0 )    ",
        "    =(  ..  )=   ",
        "     (\")__(\")    ",
      ],
      [
        "                 ",
        "      (|__/)     ",
        "     ( 0  0 )    ",
        "    =(  ..  )=   ",
        "     (\")__(\")    ",
      ],
      [
        "                 ",
        "      (\\__/)     ",
        "     ( 0  0 )    ",
        "    =( .  . )=   ",
        "     (\")__(\")    ",
      ],
    ],
  },
  mushroom: {
    frames: [
      [
        "                 ",
        "    .-o-OO-o-.   ",
        "   (__________)  ",
        "      |0  0|     ",
        "      |____|     ",
      ],
      [
        "                 ",
        "    .-O-oo-O-.   ",
        "   (__________)  ",
        "      |0  0|     ",
        "      |____|     ",
      ],
      [
        "      . o  .     ",
        "    .-o-OO-o-.   ",
        "   (__________)  ",
        "      |0  0|     ",
        "      |____|     ",
      ],
    ],
  },
  chonk: {
    frames: [
      [
        "                 ",
        "     /\\    /\\    ",
        "    ( 0    0 )   ",
        "    (   ..   )   ",
        "     `------\u00b4   ",
      ],
      [
        "                 ",
        "     /\\    /|    ",
        "    ( 0    0 )   ",
        "    (   ..   )   ",
        "     `------\u00b4   ",
      ],
      [
        "                 ",
        "     /\\    /\\    ",
        "    ( 0    0 )   ",
        "    (   ..   )   ",
        "     `------\u00b4~  ",
      ],
    ],
  },
};

// ---------------------------------------------------------------------------
// Hats — 8 hats x 13 UTF-8 bytes (centered)
// ---------------------------------------------------------------------------

export const hats = {
  none: "             ",
  crown: "    \\^^^/    ",
  tophat: "    [___]    ",
  propeller: "     -+-     ",
  halo: "    (   )    ",
  wizard: "     /^\\     ",
  beanie: "    (___)    ",
  tinyduck: "      ,>     ",
};

// ---------------------------------------------------------------------------
// Compact face rendering — from original Claude Code sprites.ts
// ---------------------------------------------------------------------------

const FACE_TEMPLATES = {
  duck:     (e) => `(${e}>`,
  goose:    (e) => `(${e}>`,
  blob:     (e) => `(${e}${e})`,
  cat:      (e) => `=${e}\u03c9${e}=`,
  dragon:   (e) => `<${e}~${e}>`,
  octopus:  (e) => `~(${e}${e})~`,
  owl:      (e) => `(${e})(${e})`,
  penguin:  (e) => `(${e}>)`,
  turtle:   (e) => `[${e}_${e}]`,
  snail:    (e) => `${e}(@)`,
  ghost:    (e) => `/${e}${e}\\`,
  axolotl:  (e) => `}${e}.${e}{`,
  capybara: (e) => `(${e}oo${e})`,
  cactus:   (e) => `|${e}  ${e}|`,
  robot:    (e) => `[${e}${e}]`,
  rabbit:   (e) => `(${e}..${e})`,
  mushroom: (e) => `|${e}  ${e}|`,
  chonk:    (e) => `(${e}.${e})`,
};

export function renderFace(species, eyeGlyph) {
  const fn = FACE_TEMPLATES[species];
  return fn ? fn(eyeGlyph) : `(${eyeGlyph}${eyeGlyph})`;
}

// ---------------------------------------------------------------------------
// Full sprite rendering — eye substitution + hat placement
// ---------------------------------------------------------------------------

export function renderSprite(species, eyeIndex, hatIndex, frame = 0) {
  const eye = EYES[eyeIndex] ?? EYES[0];
  const speciesData = bodySprites[species];
  if (!speciesData) return [];
  const frames = speciesData.frames;
  const body = frames[frame % frames.length].map((row) =>
    row.replaceAll("0", eye),
  );
  const hat = HAT_ORDER[hatIndex];
  if (hat && hat !== "none" && !body[0].trim()) {
    body[0] = "  " + hats[hat] + "  ";
  }
  return body;
}

// ---------------------------------------------------------------------------
// Font glyph sets — unique codepoints per embedded font, derived from source data
//
// Both fonts are subsetted from the same 89-codepoint union,
// but CSS class routing determines which font renders which surface:
//   .sprite  → DejaVu Sans Mono  (SPRITE_FONT_GLYPHS)
//   .stat    → Iosevka SemiBold  (CHROME_FONT_GLYPHS)
// ---------------------------------------------------------------------------

function _uniqueSorted(chars) {
  return [...new Set(chars)].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

function _titleCase(s) {
  return s[0].toUpperCase() + s.slice(1);
}

// Sprite font (DejaVu Sans Mono / .sprite CSS class)
// Sources: body rows (all frames), hat rows, eye glyphs, fallback eye
// The "0" sentinel in body rows is excluded — it never reaches the font;
// the renderer substitutes the actual eye glyph before emission.
function _deriveSpriteGlyphs() {
  const all = [];
  for (const sp of Object.values(bodySprites)) {
    for (const frame of sp.frames) {
      for (const row of frame) {
        for (const ch of row) {
          if (ch !== "0") all.push(ch);
        }
      }
    }
  }
  for (const row of Object.values(hats)) {
    for (const ch of row) all.push(ch);
  }
  for (const eye of EYES) all.push(eye);
  all.push("?"); // defensive fallback eye from _eyeGlyph
  return _uniqueSorted(all);
}

// Chrome font (Iosevka SemiBold / .stat CSS class)
// Sources: species/rarity/stage labels (title case + uppercase for terminal),
// stat labels (title case), terminal abbreviations, prompt, separators,
// digits 0-9
function _deriveChromeGlyphs() {
  const all = [];
  // Species, rarity, stage labels — title case (classic/text) + uppercase (terminal)
  for (const name of [...SPECIES_ORDER, ...RARITIES, ...STAGES]) {
    for (const ch of _titleCase(name)) all.push(ch);
    for (const ch of name.toUpperCase()) all.push(ch);
  }
  // Stat labels — title case (classic/text) + uppercase (terminal footer uses abbrevs,
  // but full names appear as uppercase in some paths)
  for (const name of STAT_NAMES) {
    for (const ch of _titleCase(name)) all.push(ch);
    for (const ch of name.toUpperCase()) all.push(ch);
  }
  // Terminal stat abbreviations
  for (const abbr of STAT_ABBREVS) {
    for (const ch of abbr) all.push(ch);
  }
  // Terminal prompt
  for (const ch of RAIL_PROMPT) all.push(ch);
  // Shiny label
  for (const ch of SHINY_LABEL) all.push(ch);
  // Chrome decorators and separators
  all.push(SHINY_DECORATOR); // ✦ in title chrome
  all.push(HEADER_SEPARATOR); // · between species/rarity/stage
  all.push(RAIL_SEPARATOR); // │
  all.push(RAIL_RULE_CHAR); // ─
  // Digits 0-9 (stat values in terminal renderer)
  for (let i = 0; i <= 9; i++) all.push(String(i));
  // Space
  all.push(" ");
  return _uniqueSorted(all);
}

export const SPRITE_FONT_GLYPHS = _deriveSpriteGlyphs();
export const CHROME_FONT_GLYPHS = _deriveChromeGlyphs();

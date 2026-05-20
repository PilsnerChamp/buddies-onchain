#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../../../.." && pwd)"

PYFTSUBSET="${PYFTSUBSET:-$(command -v pyftsubset || true)}"
PYTHON3="${PYTHON3:-$(command -v python3 || true)}"

SOURCE_FONT_REL="onchain/contract-data/fonts/chrome/Iosevka-SemiBold.ttf"
LICENSE_REL="onchain/contract-data/fonts/chrome/Iosevka-LICENSE.md"
GLYPH_AUDIT="onchain/contract-data/fonts/glyph-audit.mjs"
OUTPUT_FONT_REL="onchain/contract-data/fonts/chrome/BuddyFont.woff2"
OUTPUT_MANIFEST_REL="onchain/contract-data/fonts/chrome/BuddyFont.manifest.json"
OUTPUT_PREVIEW_REL="onchain/contract-data/fonts/chrome/preview.html"
TMP_DIR="${TMPDIR:-/tmp}/buddies-onchain-buddyfont-step2"
FONT_SIZE="24"
DROP_TABLES="BASE,DSIG,FFTM,GDEF,GPOS,GSUB,MATH,STAT,SVG,VORG,gasp,hdmx,kern,LTSH,VDMX,vhea,vmtx"

SOURCE_FONT="$REPO_ROOT/$SOURCE_FONT_REL"
LICENSE_FILE="$REPO_ROOT/$LICENSE_REL"
OUTPUT_FONT="$REPO_ROOT/$OUTPUT_FONT_REL"
OUTPUT_MANIFEST="$REPO_ROOT/$OUTPUT_MANIFEST_REL"
OUTPUT_PREVIEW="$REPO_ROOT/$OUTPUT_PREVIEW_REL"
TMP_FONT="$TMP_DIR/BuddyFont.woff2"

fail() {
  echo "Error: $*" >&2
  exit 1
}

[[ -x "$PYFTSUBSET" ]] || fail "pyftsubset not found or not executable at $PYFTSUBSET"
[[ -x "$PYTHON3" ]] || fail "python3 not found or not executable at $PYTHON3"
[[ -f "$SOURCE_FONT" ]] || fail "Pinned source font not found at $SOURCE_FONT_REL"
[[ -f "$LICENSE_FILE" ]] || fail "Pinned license file not found at $LICENSE_REL"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR" "$REPO_ROOT/onchain/contract-data/fonts/chrome"
trap 'rm -rf "$TMP_DIR"' EXIT

# Expression derived from CHROME_FONT_GLYPHS in buddies-source.mjs
NORMALIZED_EXPR="$(node "$REPO_ROOT/$GLYPH_AUDIT" --expr chrome)"
[[ -n "$NORMALIZED_EXPR" ]] || fail "Failed to derive chrome glyph expression from $GLYPH_AUDIT"
echo "Chrome font expression ($GLYPH_AUDIT --expr chrome):"
echo "  $NORMALIZED_EXPR"

PYFTSUBSET_COMMAND="pyftsubset \$SOURCE_FONT --output-file=\$OUTPUT_FONT --flavor=woff2 --unicodes=$NORMALIZED_EXPR --no-hinting --layout-features= --name-IDs=* --drop-tables+=$DROP_TABLES"

"$PYFTSUBSET" "$SOURCE_FONT" \
  --output-file="$TMP_FONT" \
  --flavor=woff2 \
  --unicodes="$NORMALIZED_EXPR" \
  --no-hinting \
  --layout-features= \
  --name-IDs='*' \
  --drop-tables+="$DROP_TABLES"

"$PYTHON3" - "$SOURCE_FONT" "$TMP_FONT" "$LICENSE_REL" "$OUTPUT_FONT_REL" "$OUTPUT_MANIFEST" "$OUTPUT_PREVIEW" "$NORMALIZED_EXPR" "$PYFTSUBSET_COMMAND" "$FONT_SIZE" <<'PY'
from pathlib import Path
from fontTools.ttLib import TTFont
import hashlib
import html
import json
import os
import re
import unicodedata
import sys

source_font = Path(sys.argv[1])
subset_font = Path(sys.argv[2])
license_rel = sys.argv[3]
output_font_rel = sys.argv[4]
manifest_path = Path(sys.argv[5])
preview_path = Path(sys.argv[6])
normalized_expression = sys.argv[7]
pyftsubset_command = sys.argv[8]
font_size = int(sys.argv[9])

# Parse the expression into codepoints
codepoints = []
for part in normalized_expression.split(','):
    part = part.strip()
    m = re.fullmatch(r'U\+([0-9A-Fa-f]{4,6})-([0-9A-Fa-f]{4,6})', part)
    if m:
        codepoints.extend(range(int(m.group(1), 16), int(m.group(2), 16) + 1))
        continue
    m = re.fullmatch(r'U\+([0-9A-Fa-f]{4,6})', part)
    if m:
        codepoints.append(int(m.group(1), 16))
        continue
    raise SystemExit(f'Unsupported Unicode token: {part}')

source_bytes = source_font.read_bytes()
subset_bytes = subset_font.read_bytes()
source_sha256 = hashlib.sha256(source_bytes).hexdigest()
output_sha256 = hashlib.sha256(subset_bytes).hexdigest()
output_size = len(subset_bytes)

source = TTFont(source_font)
subset = TTFont(subset_font)
subset_cmap = subset.getBestCmap()
missing = [cp for cp in codepoints if cp not in subset_cmap]
if missing:
    missing_list = ', '.join(f'U+{cp:04X}' for cp in missing)
    raise SystemExit(f'Subset font is missing required codepoints: {missing_list}')

forbidden_tables = sorted({'GSUB', 'GPOS', 'GDEF'} & set(subset.keys()))
if forbidden_tables:
    raise SystemExit(f'Subset still contains forbidden layout tables: {", ".join(forbidden_tables)}')

head = subset['head']
hhea = subset['hhea']
hmtx = subset['hmtx']
upem = head.unitsPerEm
advance_raw = hmtx[subset_cmap[ord('x')]][0]
ascent_raw = hhea.ascent
descent_raw = hhea.descent
line_gap_raw = hhea.lineGap
scale = font_size / upem

glyph_advance = advance_raw * scale
ascent = ascent_raw * scale
descent = (-descent_raw) * scale
line_height = (ascent_raw - descent_raw + line_gap_raw) * scale
rounding_note = 'none'

size_warning_note = None
if output_size >= 8192:
    table_lengths = {tag: entry.length for tag, entry in subset.reader.tables.items()}
    retained_total = sum(table_lengths.values()) or 1
    largest = sorted(table_lengths.items(), key=lambda item: item[1], reverse=True)[:2]
    pieces = [
        f'{tag} accounted for ~{(length / retained_total) * 100:.0f}% of retained table bytes'
        for tag, length in largest
    ]
    pieces.append('hinting disabled')
    pieces.append('no stylistic sets enabled')
    size_warning_note = '; '.join(pieces)

if output_size >= 10240:
    raise SystemExit(f'Subset output exceeds hard fail threshold: {output_size} bytes')

family_name = source['name'].getDebugName(16) or source['name'].getDebugName(1) or 'Iosevka'
version_name = source['name'].getDebugName(5) or source['name'].getDebugName(3) or 'unknown'
version_token = version_name.replace('Version ', '').split(';')[0].strip()

manifest = {
    'source': {
        'fontFile': 'onchain/contract-data/fonts/chrome/Iosevka-SemiBold.ttf',
        'sha256': source_sha256,
        'upstreamName': f'Iosevka {version_token} local drop',
        'license': {
            'spdx': 'OFL-1.1',
            'path': license_rel,
        },
    },
    'family': 'Iosevka',
    'weight': 'SemiBold',
    'output': {
        'file': output_font_rel,
        'sha256': output_sha256,
        'sizeBytes': output_size,
    },
    'metrics': {
        'fontSize': font_size,
        'glyphAdvance': glyph_advance,
        'ascent': ascent,
        'descent': descent,
        'lineHeight': line_height,
        'rounding': rounding_note,
        'rawValues': {
            'advance': advance_raw,
            'ascent': ascent_raw,
            'descent': descent_raw,
            'lineGap': line_gap_raw,
            'upem': upem,
        },
        'rawSource': {
            'advance': 'hmtx[x]',
            'ascent': 'hhea.ascent',
            'descent': 'hhea.descent',
            'lineGap': 'hhea.lineGap',
            'upem': 'head.unitsPerEm',
        },
    },
    'glyphCount': len(subset.getGlyphOrder()),
    'unicodeExpression': normalized_expression,
    'pyftsubsetCommand': pyftsubset_command,
    'pyftsubsetCommandNote': '`$SOURCE_FONT` and `$OUTPUT_FONT` are placeholders for the repo-relative paths recorded in `source.fontFile` and `output.file`; the command string is descriptive, reproducibility is gated on `output.sha256` and `output.sizeBytes`.',
    'characterSetSource': 'onchain/contract-data/sprites/buddies-source.mjs (CHROME_FONT_GLYPHS)',
    'sizeThresholdsBytes': {'warn': 8192, 'hardFail': 10240},
    'notes': {
        'stylisticSets': 'No stylistic set flags or alternate character variants were enabled; the subset uses the default local Iosevka SemiBold build and strips GSUB/GPOS/GDEF.',
        'chromeOnlySubset': 'This subset contains only chrome glyphs (CHROME_FONT_GLYPHS from buddies-source.mjs). Sprite body glyphs are in the separate DejaVu/BuddySpriteFont subset.',
        'deferredOptimizations': ['--name-IDs=* retains the full name table (~0.5-1 KB); prune if Step 3 hits deploy-size pressure.'],
    },
}
if size_warning_note is not None:
    manifest['notes']['sizeInvestigation'] = size_warning_note

manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

critical_glyphs = [
    {'char': '0', 'label': 'Stat value digit zero', 'codepoint': 'U+0030', 'subset': True},
    {'char': '8', 'label': 'Stat value digit eight', 'codepoint': 'U+0038', 'subset': True},
    {'char': '─', 'label': 'Rail rule', 'codepoint': 'U+2500', 'subset': True},
    {'char': '│', 'label': 'Rail separator', 'codepoint': 'U+2502', 'subset': True},
    {'char': '✦', 'label': 'Shiny decorator', 'codepoint': 'U+2726', 'subset': True},
    {'char': '·', 'label': 'Chrome separator', 'codepoint': 'U+00B7', 'subset': True},
    {'char': 'X', 'label': 'Uppercase X (AXOLOTL)', 'codepoint': 'U+0058', 'subset': True},
]

def display_char(ch: str) -> str:
    return '␠' if ch == ' ' else html.escape(ch)

def codepoint_label(cp: int) -> str:
    name = unicodedata.name(chr(cp), 'UNKNOWN')
    return f'U+{cp:04X} · {name}'

cards = []
for cp in codepoints:
    ch = chr(cp)
    cards.append(
        '<article class="glyph-card">'
        f'<div class="glyph-sample">{display_char(ch)}</div>'
        f'<div class="glyph-char">{html.escape(repr(ch)[1:-1] if ch != " " else "space")}</div>'
        f'<div class="glyph-code">{html.escape(codepoint_label(cp))}</div>'
        '</article>'
    )

critical_cards = []
for item in critical_glyphs:
    classes = 'critical-card' + ('' if item['subset'] else ' fallback-check')
    subset_flag = 'In subset' if item['subset'] else 'Preview-only cross-check'
    critical_cards.append(
        f'<article class="{classes}">'
        f'<div class="glyph-sample critical">{display_char(item["char"])}</div>'
        f'<div class="glyph-code">{html.escape(item["codepoint"])} · {html.escape(item["label"])} · {html.escape(subset_flag)}</div>'
        '</article>'
    )

preview_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BuddyFont Preview</title>
  <style>
    @font-face {{
      font-family: 'BuddyFont';
      src: url('./BuddyFont.woff2') format('woff2');
      font-style: normal;
      font-weight: 600;
      font-display: block;
    }}
    :root {{
      color-scheme: dark;
      --bg: #0f172a;
      --panel: #111827;
      --panel-2: #1f2937;
      --border: #334155;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #f59e0b;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 32px;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, sans-serif;
    }}
    main {{ max-width: 1120px; margin: 0 auto; }}
    h1, h2 {{ margin: 0 0 12px; }}
    p, li {{ color: var(--muted); line-height: 1.5; }}
    .panel {{
      background: rgba(17, 24, 39, 0.9);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
    }}
    .font-sample {{
      font-family: 'BuddyFont', serif;
      font-feature-settings: 'liga' 0, 'calt' 0;
      font-variant-ligatures: none;
    }}
    .critical-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }}
    .critical-card, .glyph-card {{
      background: var(--panel-2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
    }}
    .fallback-check {{ border-style: dashed; }}
    .glyph-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }}
    .glyph-sample {{
      min-height: 74px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'BuddyFont', serif;
      font-feature-settings: 'liga' 0, 'calt' 0;
      font-variant-ligatures: none;
      font-size: 40px;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 10px;
      margin-bottom: 10px;
    }}
    .glyph-sample.critical {{ font-size: 44px; }}
    .glyph-char {{
      font-family: ui-monospace, monospace;
      color: var(--accent);
      margin-bottom: 6px;
    }}
    .glyph-code {{
      font-size: 13px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }}
    .union-line {{
      font-family: 'BuddyFont', serif;
      font-feature-settings: 'liga' 0, 'calt' 0;
      font-variant-ligatures: none;
      font-size: 24px;
      line-height: 1.5;
      padding: 12px 14px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.2);
      white-space: pre-wrap;
    }}
    code {{ font-family: ui-monospace, monospace; }}
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>BuddyFont Preview</h1>
      <p>This page loads <code>BuddyFont.woff2</code> via <code>@font-face</code> and uses the fallback stack <code>'BuddyFont', serif</code> so an unintended fallback is visually obvious.</p>
      <p class="font-sample">No stylistic set flags are enabled. Ligatures are disabled.</p>
    </section>

    <section class="panel">
      <h2>Chrome-critical glyphs</h2>
      <p>Spot-check these chrome-specific glyphs: rail separators, stat digits, and the shiny decorator.</p>
      <div class="critical-grid">
        {''.join(critical_cards)}
      </div>
    </section>

    <section class="panel">
      <h2>Chrome font subset ({len(codepoints)} codepoints)</h2>
      <p>Source: <code>CHROME_FONT_GLYPHS</code> from <code>buddies-source.mjs</code>. Sprite glyphs are in the separate DejaVu subset.</p>
      <div class="union-line">{"".join(display_char(chr(cp)) for cp in codepoints)}</div>
    </section>

    <section class="panel">
      <h2>Per-codepoint cards</h2>
      <div class="glyph-grid">
        {''.join(cards)}
      </div>
    </section>
  </main>
</body>
</html>
'''
preview_path.write_text(preview_html)
PY

mv "$TMP_FONT" "$OUTPUT_FONT"

OUTPUT_SIZE=$(wc -c < "$OUTPUT_FONT")
if (( OUTPUT_SIZE >= 10240 )); then
  fail "Subset output exceeded hard fail threshold: ${OUTPUT_SIZE} bytes"
fi
if (( OUTPUT_SIZE >= 8192 )); then
  echo "Warning: subset output is ${OUTPUT_SIZE} bytes (>= 8192 target threshold)" >&2
fi

echo "Wrote $OUTPUT_FONT_REL"
echo "Wrote $OUTPUT_MANIFEST_REL"
echo "Wrote $OUTPUT_PREVIEW_REL"

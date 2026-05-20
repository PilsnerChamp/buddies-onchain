#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../../../../.." && pwd)"

PYFTSUBSET="${PYFTSUBSET:-$(command -v pyftsubset || true)}"
PYTHON3="${PYTHON3:-$(command -v python3 || true)}"

SOURCE_FONT_REL="onchain/contract-data/fonts/sprite/DejaVuSansMono.ttf"
LICENSE_REL="onchain/contract-data/fonts/sprite/DejaVu-LICENSE.md"
GLYPH_AUDIT="onchain/contract-data/fonts/glyph-audit.mjs"
OUTPUT_FONT_REL="onchain/contract-data/fonts/sprite/BuddySpriteFont.woff2"
OUTPUT_MANIFEST_REL="onchain/contract-data/fonts/sprite/BuddySpriteFont.manifest.json"
OUTPUT_PREVIEW_REL="onchain/contract-data/fonts/sprite/preview.html"
TMP_DIR="${TMPDIR:-/tmp}/buddies-onchain-buddyspritefont"
DROP_TABLES="BASE,DSIG,FFTM,GDEF,GPOS,GSUB,MATH,STAT,SVG,VORG,gasp,hdmx,kern,LTSH,VDMX,vhea,vmtx"

SOURCE_FONT="$REPO_ROOT/$SOURCE_FONT_REL"
LICENSE_FILE="$REPO_ROOT/$LICENSE_REL"
OUTPUT_FONT="$REPO_ROOT/$OUTPUT_FONT_REL"
OUTPUT_MANIFEST="$REPO_ROOT/$OUTPUT_MANIFEST_REL"
OUTPUT_PREVIEW="$REPO_ROOT/$OUTPUT_PREVIEW_REL"
TMP_FONT="$TMP_DIR/BuddySpriteFont.woff2"

fail() {
  echo "Error: $*" >&2
  exit 1
}

[[ -x "$PYFTSUBSET" ]] || fail "pyftsubset not found or not executable at $PYFTSUBSET"
[[ -x "$PYTHON3" ]] || fail "python3 not found or not executable at $PYTHON3"
[[ -f "$SOURCE_FONT" ]] || fail "Source font not found at $SOURCE_FONT_REL"
[[ -f "$LICENSE_FILE" ]] || fail "License file not found at $LICENSE_REL"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR" "$REPO_ROOT/onchain/contract-data/fonts/sprite"
trap 'rm -rf "$TMP_DIR"' EXIT

# Expression derived from SPRITE_FONT_GLYPHS in buddies-source.mjs
NORMALIZED_EXPR="$(node "$REPO_ROOT/$GLYPH_AUDIT" --expr sprite)"
[[ -n "$NORMALIZED_EXPR" ]] || fail "Failed to derive sprite glyph expression from $GLYPH_AUDIT"
echo "Sprite font expression ($GLYPH_AUDIT --expr sprite):"
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

"$PYTHON3" - "$SOURCE_FONT" "$TMP_FONT" "$LICENSE_REL" "$OUTPUT_FONT_REL" "$OUTPUT_MANIFEST" "$OUTPUT_PREVIEW" "$NORMALIZED_EXPR" "$PYFTSUBSET_COMMAND" <<'PY'
from pathlib import Path
from fontTools.ttLib import TTFont
import hashlib
import html
import json
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

# Parse expression into codepoints
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
# Use space glyph for advance — DejaVu is uniform monospace
advance_raw = hmtx[subset_cmap[ord(' ')]][0]
ascent_raw = hhea.ascent
descent_raw = hhea.descent
line_gap_raw = hhea.lineGap

# Verify uniform advance across all subset glyphs
non_uniform = []
for cp in codepoints:
    glyph_name = subset_cmap.get(cp)
    if glyph_name:
        adv = hmtx[glyph_name][0]
        if adv != advance_raw:
            non_uniform.append(f'U+{cp:04X} ({chr(cp)}) advance={adv} != {advance_raw}')
if non_uniform:
    raise SystemExit('Non-uniform glyph advances detected:\n  ' + '\n  '.join(non_uniform))

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
    size_warning_note = '; '.join(pieces)

if output_size >= 10240:
    raise SystemExit(f'Subset output exceeds hard fail threshold: {output_size} bytes')

family_name = source['name'].getDebugName(1) or 'DejaVu Sans Mono'
version_name = source['name'].getDebugName(5) or 'unknown'
version_token = version_name.replace('Version ', '').strip()

manifest = {
    'source': {
        'fontFile': 'onchain/contract-data/fonts/sprite/DejaVuSansMono.ttf',
        'sha256': source_sha256,
        'upstreamName': f'DejaVu Sans Mono {version_token}',
        'license': {
            'spdx': 'Bitstream-Vera',
            'path': license_rel,
        },
    },
    'family': 'DejaVu Sans Mono',
    'weight': 'Regular',
    'output': {
        'file': output_font_rel,
        'sha256': output_sha256,
        'sizeBytes': output_size,
    },
    'metrics': {
        'rawValues': {
            'advance': advance_raw,
            'ascent': ascent_raw,
            'descent': descent_raw,
            'lineGap': line_gap_raw,
            'upem': upem,
        },
        'rawSource': {
            'advance': 'hmtx[space]',
            'ascent': 'hhea.ascent',
            'descent': 'hhea.descent',
            'lineGap': 'hhea.lineGap',
            'upem': 'head.unitsPerEm',
        },
        'uniformAdvance': True,
    },
    'glyphCount': len(subset.getGlyphOrder()),
    'unicodeExpression': normalized_expression,
    'pyftsubsetCommand': pyftsubset_command,
    'characterSetSource': 'onchain/contract-data/sprites/buddies-source.mjs (SPRITE_FONT_GLYPHS)',
    'sizeThresholdsBytes': {'warn': 8192, 'hardFail': 10240},
    'notes': {
        'uniformAdvanceVerified': f'All {len(codepoints)} requested codepoints have advance={advance_raw} at upem={upem}.',
        'purpose': 'Sprite body rows (.sprite CSS class). Fixes Iosevka .WWID double-width eye glyph problem.',
    },
}
if size_warning_note is not None:
    manifest['notes']['sizeInvestigation'] = size_warning_note

manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

# --- Preview HTML ---
def display_char(ch: str) -> str:
    return '&#x2420;' if ch == ' ' else html.escape(ch)

def codepoint_label(cp: int) -> str:
    name = unicodedata.name(chr(cp), 'UNKNOWN')
    return f'U+{cp:04X} &middot; {name}'

cards = []
for cp in codepoints:
    ch = chr(cp)
    cards.append(
        '<article class="glyph-card">'
        f'<div class="glyph-sample">{display_char(ch)}</div>'
        f'<div class="glyph-char">{html.escape(repr(ch)[1:-1] if ch != " " else "space")}</div>'
        f'<div class="glyph-code">{codepoint_label(cp)}</div>'
        '</article>'
    )

# Build a sample sprite for the preview
sample_sprites = [
    '      /\\_/\\      ',
    '     ( \u00b7   \u00b7)    ',
    '     (  \u03c9  )    ',
    '     (\")_(\")',
]

sprite_preview = '\n'.join(
    f'<div class="sprite-row">{html.escape(row)}</div>'
    for row in sample_sprites
)

preview_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>BuddySpriteFont Preview</title>
  <style>
    @font-face {{
      font-family: 'BuddySpriteFont';
      src: url('./BuddySpriteFont.woff2') format('woff2');
      font-style: normal;
      font-weight: 400;
      font-display: block;
    }}
    :root {{
      color-scheme: dark;
      --bg: #0f172a;
      --panel: #1f2937;
      --border: #334155;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #f59e0b;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0; padding: 32px;
      background: var(--bg); color: var(--text);
      font-family: system-ui, sans-serif;
    }}
    main {{ max-width: 960px; margin: 0 auto; }}
    h1, h2 {{ margin: 0 0 12px; }}
    p {{ color: var(--muted); line-height: 1.5; }}
    .panel {{
      background: rgba(17,24,39,0.9);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
    }}
    .sprite-row {{
      font-family: 'BuddySpriteFont', serif;
      font-size: 37px;
      white-space: pre;
      line-height: 1.4;
    }}
    .glyph-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }}
    .glyph-card {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
    }}
    .glyph-sample {{
      min-height: 60px;
      display: flex; align-items: center; justify-content: center;
      font-family: 'BuddySpriteFont', serif;
      font-size: 37px;
      background: rgba(15,23,42,0.65);
      border: 1px solid rgba(148,163,184,0.2);
      border-radius: 10px;
      margin-bottom: 8px;
    }}
    .glyph-char {{
      font-family: ui-monospace, monospace;
      color: var(--accent);
      margin-bottom: 4px;
    }}
    .glyph-code {{
      font-size: 12px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }}
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>BuddySpriteFont Preview</h1>
      <p>DejaVu Sans Mono subset for <code>.sprite</code> CSS class.
         Fallback is <code>serif</code> so missing glyphs are obvious.</p>
    </section>

    <section class="panel">
      <h2>Sample sprite (cat)</h2>
      {sprite_preview}
    </section>

    <section class="panel">
      <h2>All {len(codepoints)} codepoints</h2>
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

#!/usr/bin/env bash
# Generate the Solidity-rendered sprite coverage sheet, or parse a saved raw log.
#
# Usage:
#   sprite-sheet.sh              # run GenerateSpriteSheet.s.sol, then build HTML/SVG output
#   sprite-sheet.sh <raw-log>    # parse an existing forge log with SPRITE_ROW / SPRITE_URI lines
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: $(basename "$0") [<raw-log>]" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

for cmd in base64 jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    exit 1
  fi
done

OUTDIR="tools/output/sprite-sheet"
RAW="${1:-tools/output/sprite-sheet-raw.log}"
rm -rf "$OUTDIR"
mkdir -p "$OUTDIR" "$(dirname "$RAW")"

if [[ $# -eq 0 ]]; then
  if ! command -v forge >/dev/null 2>&1; then
    echo "error: required command not found: forge" >&2
    exit 1
  fi

  echo "Generating sprite-sheet raw log from the Solidity renderer..."
  forge script script/GenerateSpriteSheet.s.sol -vvvv 2>&1 | tee "$RAW" >/dev/null
elif [[ ! -f "$RAW" ]]; then
  echo "error: raw log not found: $RAW" >&2
  exit 1
fi

# Parse SPRITE_ROW + SPRITE_URI pairs, decode SVGs, build HTML grid
INDEX="$OUTDIR/index.html"
cat > "$INDEX" <<'HEADER'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Buddy Sprite Sheet</title>
<style>
  body { background: #111; color: #eee; font-family: monospace; padding: 16px; }
  h1 { text-align: center; }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-width: 1200px; margin: 0 auto; }
  .card { border: 1px solid #333; border-radius: 4px; overflow: hidden; text-align: center; }
  .card img { width: 100%; height: auto; }
  .card .label { padding: 4px; font-size: 11px; background: #222; }
  h2 { margin-top: 32px; border-bottom: 1px solid #444; padding-bottom: 4px; }
  .section { margin-bottom: 24px; }
</style>
</head><body><h1>Buddy Sprite Sheet</h1>
HEADER

CARD_NUM=0
CURRENT_VARIANT=""
pending_meta=""
pending_variant=""

escape_html() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\&#39;/g"
}

while IFS= read -r line; do
  if [[ "$line" == SPRITE_ROW* ]]; then
    pending_meta="${line#SPRITE_ROW }"
    pending_variant=$(printf '%s' "$pending_meta" | sed -n 's/.*variant=\([^[:space:]]*\).*/\1/p')
    if [ -z "$pending_variant" ]; then
      echo "error: SPRITE_ROW missing variant field: $pending_meta" >&2
      exit 1
    fi
  elif [[ "$line" == SPRITE_URI\ * ]]; then
    if [ -z "$pending_meta" ]; then
      echo "error: SPRITE_URI without preceding SPRITE_ROW in $RAW" >&2
      exit 1
    fi

    URI="${line#SPRITE_URI }"
    CARD_NUM=$((CARD_NUM + 1))

    if [ "$pending_variant" != "$CURRENT_VARIANT" ]; then
      if [ -n "$CURRENT_VARIANT" ]; then
        echo '</div></div>' >> "$INDEX"
      fi
      escaped_variant="$(escape_html "$pending_variant")"
      echo "<div class=\"section\"><h2>Variant: $escaped_variant</h2><div class=\"grid\">" >> "$INDEX"
      CURRENT_VARIANT="$pending_variant"
    fi

    # Decode JSON, extract SVG
    JSON=$(echo "$URI" | sed 's/^data:application\/json;base64,//' | base64 -d)
    SVG_B64=$(echo "$JSON" | jq -r '.image' | sed 's/^data:image\/svg+xml;base64,//')

    # Write individual SVG file
    echo "$SVG_B64" | base64 -d > "$OUTDIR/card_${CARD_NUM}.svg"

    # Embed in HTML as base64 img
    escaped_meta="$(escape_html "$pending_meta")"
    echo "<div class=\"card\"><img src=\"data:image/svg+xml;base64,$SVG_B64\" /><div class=\"label\">$escaped_meta</div></div>" >> "$INDEX"
    pending_meta=""
    pending_variant=""
  fi
done < <(grep -E '^\s*(SPRITE_ROW|SPRITE_URI) ' "$RAW" | sed 's/^[[:space:]]*//')

if [ -n "$pending_meta" ]; then
  echo "error: SPRITE_ROW without following SPRITE_URI in $RAW" >&2
  exit 1
fi

if [ "$CARD_NUM" -eq 0 ]; then
  echo "error: no SPRITE_ROW / SPRITE_URI pairs found in $RAW" >&2
  exit 1
fi

if [ -n "$CURRENT_VARIANT" ]; then
  echo '</div></div>' >> "$INDEX"
fi

echo "</body></html>" >> "$INDEX"

echo "Done. $CARD_NUM cards written to $OUTDIR/"
echo "Open: $INDEX"

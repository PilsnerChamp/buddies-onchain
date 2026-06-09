#!/usr/bin/env bash
# Rasterize OG card SVGs to PNGs in site/public/.
# SVG sources are hand-editable source of truth; PNGs are derived artifacts.
#
# Requirements: chromium (Chrome for Testing). ImageMagick's MSVG renderer
# silently falls back to system fonts (@font-face ignored), so we use
# headless chromium which consumes the embedded base64 WOFF2 @font-face
# declarations exactly.
#
# Usage (from repo root):
#   bash site/tools/og/render.sh
#
# After running:
#   og-home.png            = default (terminal variant; carries narrative weight)
#   og-home-icon.png       = bare {@,@}~ face on surface (also favicon source)
#   og-home.svg            = served copy of og-card-terminal.svg (source of truth)
#   og-home-icon.svg       = served copy of og-card-icon.svg (source of truth)

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/../../.." && pwd)"
out="$repo_root/site/public"

rasterize() {
  local svg="$1" png="$2"
  # Render at 1200x640 then crop to 1200x630. Chromium headless --screenshot
  # clips the bottom ~10px of the viewport even with --hide-scrollbars, so
  # a direct 1200x630 capture loses the bottom stroke of the terminal frame.
  # Render tall, crop flush.
  chromium \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1200,640 \
    --default-background-color=0a0818ff \
    --screenshot="$png" \
    "file://$svg" >/dev/null 2>&1
  mogrify -crop 1200x630+0+0 +repage "$png"
  identify -format "%wx%h\n" "$png"
}

# Default og-home.png = terminal (carries narrative weight; see
# `docs/site/terminal-ui.md` § OG card).
echo "terminal $(rasterize "$here/og-card-terminal.svg" "$out/og-home.png")"
echo "icon     $(rasterize "$here/og-card-icon.svg"     "$out/og-home-icon.png")"

# Served SVGs are derived artifacts: copy the hand-edited sources so the served
# vector cards never drift from site/tools/og/*.svg (single source of truth).
cp "$here/og-card-terminal.svg" "$out/og-home.svg"
cp "$here/og-card-icon.svg"     "$out/og-home-icon.svg"
echo "svg      og-home.svg, og-home-icon.svg (copied from source)"

# --- favicon ---
# Per-size SVG sources (favicon-16.svg, favicon-32.svg) hand-tuned for legibility
# at each pixel grid. Render each at 16x device-scale-factor, Lanczos downsample
# to native size. Transparent BG (default-background-color=00000000).
favicon_rasterize() {
  local size="$1"
  local svg="$out/favicon-$size.svg"
  local hi="/tmp/favicon-$size-hi.png"
  local png="$out/favicon-$size.png"
  chromium \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=16 \
    --window-size="$size,$size" \
    --default-background-color=00000000 \
    --screenshot="$hi" \
    "file://$svg" >/dev/null 2>&1
  convert "$hi" -filter Lanczos -resize "${size}x${size}" "$png"
  identify -format "%wx%h" "$png"
}
echo "favicon  32: $(favicon_rasterize 32), 16: $(favicon_rasterize 16)"

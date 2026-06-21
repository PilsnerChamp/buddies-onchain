#!/usr/bin/env bash
# Rasterize the reference-card SVGs to PNGs for README/doc display.
#
# The SVGs in onchain/contract-data/reference-cards/ are the source of truth
# (canonical on-chain renderer output). GitHub strips <style>, CSS animation,
# and @font-face from inline/<img> SVG, so the README needs raster copies.
# ImageMagick's MSVG renderer ignores the embedded base64 WOFF2 @font-face and
# falls back to system fonts; headless Chromium consumes them exactly. So we
# screenshot with Chromium (same approach as site/tools/og/render.sh).
#
# Animations freeze at their first frame in a screenshot — fine for a still.
#
# Usage (from repo root):
#   bash onchain/tools/renderer/render-reference-cards-png.sh

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/../../.." && pwd)"
src="$repo_root/onchain/contract-data/reference-cards"
out="$repo_root/docs/assets/buddies"
mkdir -p "$out"

# The card SVGs carry only viewBox="0 0 420 420" (no width/height), so a
# standalone load stretches them to the window. Inject explicit width/height so
# the SVG renders 420x420 flush at the top-left with no margin, in a window
# comfortably larger than the card (a window sized exactly to the card height
# gets clamped short by headless Chromium). Screenshot at dsf 2, then crop the
# 840x840 (=420 css px) card from the top-left.
rasterize() {
  local svg="$1" png="$2" sized
  sized="$(mktemp --suffix=.svg)"
  sed -E '0,/<svg /s//<svg width="420" height="420" /' "$svg" > "$sized"
  chromium \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size=500,500 \
    --default-background-color=0a0818ff \
    --screenshot="$png" \
    "file://$sized" >/dev/null 2>&1
  mogrify -crop 840x840+0+0 +repage "$png"
  identify -format "%wx%h" "$png"
}

# slug in repo  ->  output name
declare -A cards=(
  [common-duck-hat]=common-duck
  [uncommon-mushroom-hatless]=uncommon-mushroom
  [rare-axolotl-hat]=rare-axolotl
  [epic-dragon-hat]=epic-dragon
  [legendary-ghost-hatless]=legendary-ghost
)

for slug in common-duck-hat uncommon-mushroom-hatless rare-axolotl-hat epic-dragon-hat legendary-ghost-hatless; do
  echo "${cards[$slug]}.png  $(rasterize "$src/$slug.svg" "$out/${cards[$slug]}.png")"
done

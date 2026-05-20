#!/usr/bin/env bash

# Usage:
# bash onchain/tools/renderer/renderer-card.sh              # default axolotl
# bash onchain/tools/renderer/renderer-card.sh duck
# bash onchain/tools/renderer/renderer-card.sh dragon
# bash onchain/tools/renderer/renderer-card.sh robot
# bash onchain/tools/renderer/renderer-card.sh single       # single-digit trait
# bash onchain/tools/renderer/renderer-card.sh hundred      # 100 trait
# bash onchain/tools/renderer/renderer-card.sh mushroom     # shiny + hatless

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTDIR="$ROOT/tools/output/renderer-card"
RAW="$OUTDIR/raw.log"
INDEX="$OUTDIR/index.html"

preset_name="${1:-axolotl}"

case "$preset_name" in
  duck)      preset_id=0 ;;
  axolotl)   preset_id=1 ;;
  dragon)    preset_id=2 ;;
  robot)     preset_id=3 ;;
  single)    preset_id=4 ;;
  hundred)   preset_id=5 ;;
  mushroom)  preset_id=6 ;;
  *)
    echo "Unknown preset: $preset_name" >&2
    echo "Available presets: duck, axolotl, dragon, robot, single, hundred, mushroom" >&2
    exit 1
    ;;
esac

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

echo "Generating renderer card preset '$preset_name' from the Solidity renderer..."
(
  cd "$ROOT"
  RENDERER_CARD_PRESET="$preset_id" forge script script/GenerateRendererCard.s.sol -vvvv
) 2>&1 | tee "$RAW"

card_line="$(grep -E '^\s*RENDERER_CARD ' "$RAW" | sed 's/^[[:space:]]*//' | tail -n 1)"
uri_line="$(grep -E '^\s*RENDERER_URI ' "$RAW" | sed 's/^[[:space:]]*//' | tail -n 1)"

if [ -z "$card_line" ] || [ -z "$uri_line" ]; then
  echo "Renderer card output missing from $RAW" >&2
  exit 1
fi

payload="${card_line#RENDERER_CARD }"
IFS='|' read -r slug label <<< "$payload"
uri="${uri_line#RENDERER_URI }"

json="$(printf '%s' "$uri" | sed 's/^data:application\/json;base64,//' | base64 -d)"
svg_b64="$(printf '%s' "$json" | jq -r '.image' | sed 's/^data:image\/svg+xml;base64,//')"
printf '%s' "$svg_b64" | base64 -d > "$OUTDIR/$slug.svg"

escape_html() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\&#39;/g"
}

escaped_label="$(escape_html "$label")"
escaped_slug="$(escape_html "$slug")"
escaped_preset="$(escape_html "$preset_name")"

cat > "$INDEX" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Buddy Renderer Card</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070b11;
      --panel: rgba(15, 23, 42, 0.76);
      --panel-border: rgba(148, 163, 184, 0.2);
      --muted: #94a3b8;
      --text: #edf2f7;
      --accent: #fb923c;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, rgba(251, 146, 60, 0.18), transparent 30%),
        linear-gradient(180deg, #070b11 0%, #020617 100%);
      color: var(--text);
      font-family: "Iosevka Aile", "IBM Plex Sans", sans-serif;
    }

    main {
      width: min(1100px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 44px;
    }

    .intro,
    .panel {
      border: 1px solid var(--panel-border);
      border-radius: 22px;
      background: var(--panel);
      backdrop-filter: blur(10px);
    }

    .intro {
      padding: 22px 24px;
      margin-bottom: 22px;
    }

    .eyebrow {
      display: inline-block;
      margin-bottom: 10px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(251, 146, 60, 0.14);
      color: #fdba74;
      font: 12px/1 "Iosevka", monospace;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    h1 {
      margin: 0 0 8px;
      font-size: clamp(30px, 5vw, 48px);
      line-height: 0.98;
      letter-spacing: -0.04em;
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }

    .command {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(2, 6, 23, 0.86);
      color: #f8fafc;
      font: 13px/1.4 "Iosevka", monospace;
      white-space: pre;
      overflow-x: auto;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }

    .card {
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .card img {
      display: block;
      width: 100%;
      height: auto;
    }

    .panel {
      padding: 18px;
    }

    .panel h2 {
      margin: 0 0 8px;
      font-size: 18px;
      letter-spacing: -0.03em;
    }

    .meta {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      font: 12px/1.5 "Iosevka", monospace;
      color: var(--muted);
      word-break: break-word;
    }

    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="intro">
      <div class="eyebrow">Single-card renderer loop</div>
      <h1>Renderer Card Review</h1>
      <p>
        This page isolates one real Solidity-rendered card so sprite position, font size,
        chrome removal, and trait redesign can be judged without the noise of a full sheet.
      </p>
      <div class="command">bash onchain/tools/renderer/renderer-card.sh $escaped_preset</div>
    </section>
    <section class="layout">
      <article class="card">
        <img src="data:image/svg+xml;base64,$svg_b64" alt="$escaped_label" />
      </article>
      <aside class="panel">
        <h2>$escaped_label</h2>
        <p>Default preset stays intentionally simple so small visual shifts are obvious. Use <code>duck</code> for baseline composition, then swap to <code>axolotl</code>, <code>dragon</code>, <code>robot</code>, or <code>mushroom</code> when you want to stress wider bodies, eye shapes, hats, stage labeling, shiny chrome, or the longest title rail.</p>
        <div class="meta">
          <div>preset: $escaped_preset</div>
          <div>slug: $escaped_slug</div>
          <div>svg: $OUTDIR/$slug.svg</div>
          <div>log: $RAW</div>
        </div>
      </aside>
    </section>
  </main>
</body>
</html>
HTML

echo "Renderer card written to $OUTDIR/"
echo "Open: $INDEX"

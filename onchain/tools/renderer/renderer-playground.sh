#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTDIR="$ROOT/tools/output/renderer-playground"
RAW="$OUTDIR/raw.log"
INDEX="$OUTDIR/index.html"

rm -rf "$OUTDIR"
mkdir -p "$OUTDIR"

echo "Generating renderer playground from the Solidity renderer..."
(
  cd "$ROOT"
  forge script script/GenerateRendererPlayground.s.sol -vvvv
) 2>&1 | tee "$RAW"

cat > "$INDEX" <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Buddy Renderer Playground</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #09090b;
      --panel: #111827;
      --panel-border: rgba(148, 163, 184, 0.24);
      --muted: #94a3b8;
      --text: #e5edf8;
      --accent: #f97316;
      --accent-soft: rgba(249, 115, 22, 0.18);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, rgba(249, 115, 22, 0.14), transparent 30%),
        linear-gradient(180deg, #09090b 0%, #020617 100%);
      color: var(--text);
      font-family: "Iosevka Aile", "IBM Plex Sans", sans-serif;
    }

    main {
      width: min(1440px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 48px;
    }

    .intro {
      margin-bottom: 28px;
      padding: 22px 24px;
      border: 1px solid var(--panel-border);
      border-radius: 20px;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(10px);
    }

    .intro h1 {
      margin: 0 0 10px;
      font-size: clamp(28px, 4vw, 44px);
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .intro p {
      margin: 0;
      max-width: 76ch;
      color: var(--muted);
      line-height: 1.5;
    }

    .command {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(2, 6, 23, 0.82);
      color: #f8fafc;
      font: 13px/1.4 "Iosevka", "SFMono-Regular", monospace;
      overflow-x: auto;
      white-space: pre;
    }

    .section {
      margin-top: 24px;
      padding: 18px;
      border: 1px solid var(--panel-border);
      border-radius: 22px;
      background: rgba(15, 23, 42, 0.62);
    }

    .section h2 {
      margin: 0 0 16px;
      font-size: 20px;
      letter-spacing: -0.03em;
    }

    .hero-card {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }

    .hero-notes {
      padding: 18px;
      border-radius: 18px;
      background: rgba(2, 6, 23, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.16);
    }

    .hero-notes h3 {
      margin: 0 0 10px;
      font-size: 18px;
    }

    .hero-notes p {
      margin: 0 0 10px;
      color: var(--muted);
      line-height: 1.5;
    }

    .hero-notes p:last-child {
      margin-bottom: 0;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .card {
      border-radius: 18px;
      overflow: hidden;
      background: var(--panel);
      border: 1px solid rgba(148, 163, 184, 0.14);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
    }

    .card img {
      display: block;
      width: 100%;
      height: auto;
      background: #000;
    }

    .card-meta {
      padding: 12px 13px 14px;
    }

    .card-label {
      margin: 0 0 5px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .card-slug {
      margin: 0;
      color: var(--muted);
      font: 12px/1.4 "Iosevka", "SFMono-Regular", monospace;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: #fed7aa;
      font: 12px/1 "Iosevka", "SFMono-Regular", monospace;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    @media (max-width: 900px) {
      .hero-card {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="intro">
      <div class="eyebrow">Renderer-only visual loop</div>
      <h1>Buddy Renderer Playground</h1>
      <p>
        This page is generated from the real Solidity renderer with mocked token state in
        forge's in-memory EVM. Use it for layout and typography reviews without Anvil,
        BuddyNFT deployment, or hatch flow noise.
      </p>
      <div class="command">bash onchain/tools/renderer/renderer-playground.sh</div>
    </section>
HTML

current_section=""
section_open=0
hero_rendered=0
card_count=0

close_section() {
  if [ "$section_open" -eq 1 ]; then
    echo "      </div>" >> "$INDEX"
    echo "    </section>" >> "$INDEX"
    section_open=0
  fi
}

open_section() {
  local section="$1"
  close_section

  case "$section" in
    centering)
      title="Centering review"
      ;;
    eyes)
      title="Eye glyph review"
      ;;
    stats)
      title="Traits and stat panel review"
      ;;
    polish)
      title="Polish and edge cases"
      ;;
    *)
      title="$section"
      ;;
  esac

  echo "    <section class=\"section\">" >> "$INDEX"
  echo "      <h2>$title</h2>" >> "$INDEX"
  echo "      <div class=\"grid\">" >> "$INDEX"
  section_open=1
}

escape_html() {
  printf '%s' "$1" | sed \
    -e 's/&/\&amp;/g' \
    -e 's/</\&lt;/g' \
    -e 's/>/\&gt;/g' \
    -e 's/"/\&quot;/g' \
    -e "s/'/\&#39;/g"
}

while IFS= read -r line; do
  if [[ "$line" == PLAYGROUND_CARD\ * ]]; then
    payload="${line#PLAYGROUND_CARD }"
    IFS='|' read -r card_section card_slug card_label <<< "$payload"
    continue
  fi

  if [[ "$line" == PLAYGROUND_URI\ * ]]; then
    uri="${line#PLAYGROUND_URI }"
    card_count=$((card_count + 1))

    json="$(printf '%s' "$uri" | sed 's/^data:application\/json;base64,//' | base64 -d)"
    svg_b64="$(printf '%s' "$json" | jq -r '.image' | sed 's/^data:image\/svg+xml;base64,//')"

    printf '%s' "$svg_b64" | base64 -d > "$OUTDIR/${card_slug}.svg"

    escaped_label="$(escape_html "$card_label")"
    escaped_slug="$(escape_html "$card_slug")"

    if [ "$card_section" = "hero" ] && [ "$hero_rendered" -eq 0 ]; then
      close_section
      cat >> "$INDEX" <<HTML
    <section class="section">
      <h2>Hero review card</h2>
      <div class="hero-card">
        <article class="card">
          <img src="data:image/svg+xml;base64,$svg_b64" alt="$escaped_label" />
          <div class="card-meta">
            <p class="card-label">$escaped_label</p>
            <p class="card-slug">$escaped_slug</p>
          </div>
        </article>
        <aside class="hero-notes">
          <h3>What to judge here</h3>
          <p>Use this as the first-pass composition rail for sprite centering, sprite scale, header weight, trait positioning, and overall card balance.</p>
          <p>The playground keeps the renderer real and the token state fake. That lets us iterate on visuals without conflating renderer design work with deployment and hatch mechanics.</p>
          <p>Once a direction looks right here, the larger sprite sheet can still be regenerated for regression review.</p>
        </aside>
      </div>
    </section>
HTML
      hero_rendered=1
      continue
    fi

    if [ "$card_section" != "$current_section" ]; then
      open_section "$card_section"
      current_section="$card_section"
    fi

    cat >> "$INDEX" <<HTML
        <article class="card">
          <img src="data:image/svg+xml;base64,$svg_b64" alt="$escaped_label" />
          <div class="card-meta">
            <p class="card-label">$escaped_label</p>
            <p class="card-slug">$escaped_slug</p>
          </div>
        </article>
HTML
  fi
done < <(grep -E '^\s*(PLAYGROUND_CARD|PLAYGROUND_URI) ' "$RAW" | sed 's/^[[:space:]]*//')

close_section

cat >> "$INDEX" <<HTML
    <section class="section">
      <h2>Output</h2>
      <div class="hero-notes">
        <p>Cards written: $card_count</p>
        <p>SVG files: $OUTDIR</p>
        <p>Raw forge log: $RAW</p>
      </div>
    </section>
  </main>
</body>
</html>
HTML

echo "Renderer playground written to $OUTDIR/"
echo "Open: $INDEX"

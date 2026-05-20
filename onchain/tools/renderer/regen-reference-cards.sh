#!/usr/bin/env bash
set -euo pipefail

# Regenerates the canonical reference-card suite committed at
# onchain/contract-data/reference-cards/.
#
# Run whenever BuddyRenderer, sprite data, or font artifacts change. The output
# is versioned — a non-trivial diff is the signal that a visual regression (or
# intentional redesign) has landed and needs human eyeballing.

ONCHAIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "$ONCHAIN_ROOT/.." && pwd)"
OUTDIR="$REPO_ROOT/onchain/contract-data/reference-cards"
RAW="$OUTDIR/.raw.log"

mkdir -p "$OUTDIR"
rm -f "$OUTDIR"/*.svg "$OUTDIR"/*.json

echo "Generating reference cards from the Solidity renderer..."
(
  cd "$ONCHAIN_ROOT"
  forge script script/GenerateReferenceCards.s.sol -vvvv
) 2>&1 | tee "$RAW" >/dev/null

card_count=0
while IFS= read -r line; do
  if [[ "$line" == REFERENCE_CARD\ * ]]; then
    payload="${line#REFERENCE_CARD }"
    IFS='|' read -r card_slug card_label <<< "$payload"
    continue
  fi

  if [[ "$line" == REFERENCE_URI\ * ]]; then
    uri="${line#REFERENCE_URI }"
    uri="${uri#\"}"
    uri="${uri%\"}"

    json="$(printf '%s' "$uri" | sed 's/^data:application\/json;base64,//' | base64 -d)"
    svg_b64="$(printf '%s' "$json" | jq -r '.image' | sed 's/^data:image\/svg+xml;base64,//')"

    printf '%s' "$svg_b64" | base64 -d > "$OUTDIR/${card_slug}.svg"
    printf '%s' "$json" | jq --arg svg "./${card_slug}.svg" '.image = $svg' > "$OUTDIR/${card_slug}.json"
    card_count=$((card_count + 1))
    echo "  -> $card_slug  ($card_label)"
  fi
done < <(grep -E '^\s*(REFERENCE_CARD|REFERENCE_URI) ' "$RAW" | sed 's/^[[:space:]]*//')

rm -f "$RAW"

echo "Reference cards written to $OUTDIR/ ($card_count cards)."

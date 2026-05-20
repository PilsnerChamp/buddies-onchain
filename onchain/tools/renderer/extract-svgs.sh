#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

RPC="http://127.0.0.1:8545"
BUDDYNFT="${1:?Usage: extract-svgs.sh <BuddyNFT address>}"
OUTDIR="tools/output/extract"
rm -f "$OUTDIR"/token*.json "$OUTDIR"/token*.svg
mkdir -p "$OUTDIR"

SUPPLY=$(cast call "$BUDDYNFT" "totalSupply()(uint256)" --rpc-url "$RPC")
echo "Total supply: $SUPPLY"

for i in $(seq 1 "$SUPPLY"); do
  echo "Extracting token #$i..."

  # Fetch tokenURI. Modern `cast call` wraps string returns in surrounding double
  # quotes — strip them before base64-decoding. See `docs/onchain/renderer.md`
  # § tokenURI extraction.
  URI=$(cast call "$BUDDYNFT" "tokenURI(uint256)(string)" "$i" --rpc-url "$RPC")
  URI="${URI#\"}"; URI="${URI%\"}"

  # Decode JSON from base64
  JSON=$(echo "$URI" | sed 's/^data:application\/json;base64,//' | base64 -d)

  # Save JSON metadata
  echo "$JSON" > "$OUTDIR/token${i}.json"

  # Extract traits for filename
  SPECIES=$(echo "$JSON" | jq -r '.attributes[] | select(.trait_type=="Species") | .value')
  RARITY=$(echo "$JSON" | jq -r '.attributes[] | select(.trait_type=="Rarity") | .value')
  SHINY=$(echo "$JSON" | jq -r '.attributes[] | select(.trait_type=="Shiny") | .value')
  if [ "$SHINY" = "Yes" ]; then SUFFIX="_shiny"; else SUFFIX=""; fi

  # Decode SVG from base64
  echo "$JSON" | jq -r '.image' | sed 's/^data:image\/svg+xml;base64,//' | base64 -d > "$OUTDIR/token${i}_${SPECIES}_${RARITY}${SUFFIX}.svg"

  echo "  -> $SPECIES / $RARITY / Shiny=$SHINY"
done

echo "Done. SVGs written to $OUTDIR/"
echo "Open in browser: e.g., firefox $OUTDIR/token1_*.svg"

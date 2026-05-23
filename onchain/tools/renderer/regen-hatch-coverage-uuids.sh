#!/usr/bin/env bash
set -euo pipefail

# Regenerates the committed hatch-coverage UUID helper and manifest.
# UUID discovery stays in Solidity: FindSpeciesUuids provides greedy axis
# coverage, FindHatlessUuid appends the first hatless UUID from the same search
# window when it is not already present, and EmitHatchCoverageManifest emits
# canonical seed + trait rows for jq to assemble.

ONCHAIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_ROOT="$(cd "$ONCHAIN_ROOT/.." && pwd)"
OUTDIR="$REPO_ROOT/onchain/contract-data/hatch-coverage"
HELPER="$REPO_ROOT/onchain/test/helpers/HatchCoverageUuids.sol"
SPECIES_RAW="$OUTDIR/.species-uuids.raw.log"
HATLESS_RAW="$OUTDIR/.hatless-uuid.raw.log"
MANIFEST_RAW="$OUTDIR/.manifest.raw.log"
ROWS_JSONL="$OUTDIR/.manifest.rows.jsonl"
UUID_TMP="$(mktemp)"

cleanup() {
  rm -f "$SPECIES_RAW" "$HATLESS_RAW" "$MANIFEST_RAW" "$ROWS_JSONL" "$UUID_TMP"
}
trap cleanup EXIT

mkdir -p "$OUTDIR"

echo "Scanning greedy hatch-coverage UUIDs..."
(
  cd "$ONCHAIN_ROOT"
  forge script script/FindSpeciesUuids.s.sol -vvvv
) 2>&1 | tee "$SPECIES_RAW" >/dev/null

mapfile -t species_uuids < <(
  grep -E '^[[:space:]]*COVERAGE_UUID ' "$SPECIES_RAW" \
    | sed -E 's/^[[:space:]]*COVERAGE_UUID //; s/^"//; s/"$//'
)

if [[ "${#species_uuids[@]}" -eq 0 ]]; then
  echo "ERROR: FindSpeciesUuids emitted no COVERAGE_UUID lines." >&2
  exit 1
fi

echo "Scanning first hatless UUID..."
(
  cd "$ONCHAIN_ROOT"
  forge script script/FindHatlessUuid.s.sol -vvvv
) 2>&1 | tee "$HATLESS_RAW" >/dev/null

mapfile -t hatless_uuids < <(
  grep -E '^[[:space:]]*HATLESS_UUID ' "$HATLESS_RAW" \
    | sed -E 's/^[[:space:]]*HATLESS_UUID //; s/^"//; s/"$//'
)

if [[ "${#hatless_uuids[@]}" -ne 1 ]]; then
  echo "ERROR: expected exactly one HATLESS_UUID line, found ${#hatless_uuids[@]}." >&2
  exit 1
fi

hatless_uuid="${hatless_uuids[0]}"

declare -a canonical_uuids=()
declare -A seen_uuids=()

for uuid in "${species_uuids[@]}"; do
  if [[ -n "${seen_uuids[$uuid]:-}" ]]; then
    echo "ERROR: duplicate COVERAGE_UUID emitted: $uuid" >&2
    exit 1
  fi
  seen_uuids["$uuid"]=1
  canonical_uuids+=("$uuid")
done

if [[ -z "${seen_uuids[$hatless_uuid]:-}" ]]; then
  canonical_uuids+=("$hatless_uuid")
  seen_uuids["$hatless_uuid"]=1
  echo "Appended first hatless UUID: $hatless_uuid"
else
  echo "First hatless UUID already present: $hatless_uuid"
fi

printf '%s\n' "${canonical_uuids[@]}" > "$UUID_TMP"

echo "Writing HatchCoverageUuids.sol (${#canonical_uuids[@]} UUIDs)..."
HELPER_PATH="$HELPER" UUID_FILE="$UUID_TMP" python3 - <<'PY'
import os
from pathlib import Path

helper = Path(os.environ["HELPER_PATH"])
uuid_file = Path(os.environ["UUID_FILE"])
uuids = [line.strip() for line in uuid_file.read_text().splitlines() if line.strip()]

text = helper.read_text()
signature = "    function hatchCoverageUuids() internal pure returns (string[] memory) {"
start = text.index(signature)
brace_start = text.index("{", start)
depth = 0
end = None
for i in range(brace_start, len(text)):
    if text[i] == "{":
        depth += 1
    elif text[i] == "}":
        depth -= 1
        if depth == 0:
            end = i
            break

if end is None:
    raise SystemExit("ERROR: could not find hatchCoverageUuids function body")

lines = [signature]
if uuids:
    lines.append(f"        string[] memory uuids = new string[]({len(uuids)});")
    for i, uuid in enumerate(uuids):
        lines.append(f'        uuids[{i}] = "{uuid}";')
    lines.append("        return uuids;")
else:
    lines.append("        return new string[](0);")
lines.append("    }")
replacement = "\n".join(lines)

helper.write_text(text[:start] + replacement + text[end + 1 :])
PY

uuid_env="$(IFS=,; printf '%s' "${canonical_uuids[*]}")"

echo "Emitting manifest rows..."
(
  cd "$ONCHAIN_ROOT"
  HATCH_COVERAGE_UUIDS="$uuid_env" forge script script/EmitHatchCoverageManifest.s.sol -vvvv
) 2>&1 | tee "$MANIFEST_RAW" >/dev/null

rm -f "$ROWS_JSONL"
while IFS= read -r line; do
  payload="${line#MANIFEST_ROW }"
  IFS='|' read -r uuid token_id seed species rarity eyes hat shiny debugging patience chaos wisdom snark <<< "$payload"
  jq -cn \
    --arg uuid "$uuid" \
    --argjson tokenId "$token_id" \
    --argjson seed "$seed" \
    --argjson species "$species" \
    --argjson rarity "$rarity" \
    --argjson eyes "$eyes" \
    --argjson hat "$hat" \
    --argjson shiny "$shiny" \
    --argjson debugging "$debugging" \
    --argjson patience "$patience" \
    --argjson chaos "$chaos" \
    --argjson wisdom "$wisdom" \
    --argjson snark "$snark" \
    '{
      uuid: $uuid,
      tokenId: $tokenId,
      seed: $seed,
      traits: {
        species: $species,
        rarity: $rarity,
        eyes: $eyes,
        hat: $hat,
        shiny: $shiny,
        debugging: $debugging,
        patience: $patience,
        chaos: $chaos,
        wisdom: $wisdom,
        snark: $snark
      }
    }' >> "$ROWS_JSONL"
done < <(grep -E '^[[:space:]]*MANIFEST_ROW ' "$MANIFEST_RAW" | sed 's/^[[:space:]]*//')

row_count="$(wc -l < "$ROWS_JSONL" | tr -d ' ')"
if [[ "$row_count" != "${#canonical_uuids[@]}" ]]; then
  echo "ERROR: manifest row count $row_count does not match UUID count ${#canonical_uuids[@]}." >&2
  exit 1
fi

jq -s '.' "$ROWS_JSONL" > "$OUTDIR/manifest.json"

echo "Validating hatch-coverage UUID manifest..."
(
  cd "$ONCHAIN_ROOT"
  forge script script/CheckHatchCoverageUuids.s.sol
) >/dev/null

echo "Hatch coverage UUID manifest written to $OUTDIR/manifest.json ($row_count UUIDs)."

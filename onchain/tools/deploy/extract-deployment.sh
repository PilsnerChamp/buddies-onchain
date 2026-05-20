#!/usr/bin/env bash
# Extract a normalized deployment record from a Foundry broadcast log.
#
# Reads:  onchain/broadcast/Deploy.s.sol/<chainId>/run-latest.json
# Writes: onchain/deployments/<chainId>.json
#
# Output shape (per docs/onchain/build.md):
#   { chainId, deployer, buddyNftBlock, addresses: { <ContractName>: <0x...> } }
#
# Hard requirements:
#   - CREATE-only (CREATE2 entries fail loudly; v1 does not support them).
#   - Exactly 5 contracts with the expected names; mismatched count or set fails loudly.
#   - `buddyNftBlock` is matched by BuddyNFT's CREATE-tx hash against `receipts[].transactionHash`,
#     NOT receipts[0].blockNumber (which is the first contract's block).
#   - All addresses EIP-55 checksummed via `cast --to-checksum-address`.
#   - No timestamp field — preserves byte-identical reproducibility across re-runs.
#
# Usage: extract-deployment.sh <chainId>
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $(basename "$0") <chainId>" >&2
  exit 2
fi

CHAIN_ID="$1"

# Resolve to onchain/ regardless of caller cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BROADCAST_LOG="$ONCHAIN_DIR/broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"
OUT_DIR="$ONCHAIN_DIR/deployments"
OUT_FILE="$OUT_DIR/$CHAIN_ID.json"

if [[ ! -f "$BROADCAST_LOG" ]]; then
  echo "error: broadcast log not found: $BROADCAST_LOG" >&2
  exit 1
fi

for cmd in jq cast; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    exit 1
  fi
done

# Reject CREATE2 (out of scope for v1; would silently misroute without salt+factory capture).
CREATE2_COUNT=$(jq '[.transactions[] | select(.transactionType == "CREATE2")] | length' "$BROADCAST_LOG")
if [[ "$CREATE2_COUNT" -ne 0 ]]; then
  echo "error: $CREATE2_COUNT CREATE2 transaction(s) in broadcast log; v1 extractor does not support CREATE2" >&2
  exit 1
fi

# Pull CREATE-only entries as a flat tab-separated stream: contractName \t contractAddress \t hash.
# `setRenderer(address)` CALL is excluded by this filter — no separate dedupe step.
mapfile -t CREATE_ROWS < <(
  jq -r '
    .transactions[]
    | select(.transactionType == "CREATE")
    | [.contractName, .contractAddress, .hash]
    | @tsv
  ' "$BROADCAST_LOG"
)

EXPECTED_NAMES=(BuddySpriteData BuddyFont BuddySpriteFont BuddyRenderer BuddyNFT)

if [[ ${#CREATE_ROWS[@]} -ne ${#EXPECTED_NAMES[@]} ]]; then
  echo "error: expected ${#EXPECTED_NAMES[@]} CREATE transactions, found ${#CREATE_ROWS[@]}" >&2
  printf '  %s\n' "${CREATE_ROWS[@]}" >&2
  exit 1
fi

# Index CREATE rows by contract name; assert the set matches the expected names exactly.
declare -A ADDR_BY_NAME=()
declare -A HASH_BY_NAME=()
for row in "${CREATE_ROWS[@]}"; do
  IFS=$'\t' read -r name addr hash <<<"$row"
  if [[ -n "${ADDR_BY_NAME[$name]:-}" ]]; then
    echo "error: duplicate CREATE entry for contract name: $name" >&2
    exit 1
  fi
  ADDR_BY_NAME["$name"]="$addr"
  HASH_BY_NAME["$name"]="$hash"
done

for name in "${EXPECTED_NAMES[@]}"; do
  if [[ -z "${ADDR_BY_NAME[$name]:-}" ]]; then
    echo "error: expected contract name not found in CREATE list: $name" >&2
    echo "  found: ${!ADDR_BY_NAME[*]}" >&2
    exit 1
  fi
done

# Pull chainId, deployer (from .transaction.from of the first CREATE — NOT .from), and BuddyNFT block.
PAYLOAD_CHAIN_ID=$(jq -r '.chain' "$BROADCAST_LOG")
if [[ "$PAYLOAD_CHAIN_ID" != "$CHAIN_ID" ]]; then
  echo "error: chainId mismatch: filename=$CHAIN_ID payload=$PAYLOAD_CHAIN_ID" >&2
  exit 1
fi

DEPLOYER_RAW=$(jq -r '
  .transactions
  | map(select(.transactionType == "CREATE"))
  | .[0].transaction.from
' "$BROADCAST_LOG")
if [[ -z "$DEPLOYER_RAW" || "$DEPLOYER_RAW" == "null" ]]; then
  echo "error: could not extract deployer from first CREATE transaction.from" >&2
  exit 1
fi
DEPLOYER=$(cast --to-checksum-address "$DEPLOYER_RAW")

BUDDYNFT_HASH="${HASH_BY_NAME[BuddyNFT]}"
BUDDYNFT_BLOCK_HEX=$(jq -r --arg h "$BUDDYNFT_HASH" '
  .receipts[]
  | select(.transactionHash == $h)
  | .blockNumber
' "$BROADCAST_LOG")
if [[ -z "$BUDDYNFT_BLOCK_HEX" || "$BUDDYNFT_BLOCK_HEX" == "null" ]]; then
  echo "error: no receipt found for BuddyNFT tx hash: $BUDDYNFT_HASH" >&2
  exit 1
fi
# Strip 0x and decode hex → decimal.
BUDDYNFT_BLOCK=$((BUDDYNFT_BLOCK_HEX))

# Build the addresses object via jq with EIP-55 checksummed values.
mkdir -p "$OUT_DIR"

# Emit a stable ordering: docs/onchain/build.md example lists addresses in deployment order
# (BuddySpriteData, BuddyFont, BuddySpriteFont, BuddyRenderer, BuddyNFT). jq's
# `--argjson` + ordered-key construction preserves it.
ADDRESSES_JSON='{'
first=1
for name in "${EXPECTED_NAMES[@]}"; do
  checksummed=$(cast --to-checksum-address "${ADDR_BY_NAME[$name]}")
  if [[ $first -eq 0 ]]; then
    ADDRESSES_JSON+=','
  fi
  ADDRESSES_JSON+=$(jq -c -n --arg k "$name" --arg v "$checksummed" '{($k): $v}' | sed 's/^{//;s/}$//')
  first=0
done
ADDRESSES_JSON+='}'

jq -n \
  --argjson chainId "$CHAIN_ID" \
  --arg deployer "$DEPLOYER" \
  --argjson buddyNftBlock "$BUDDYNFT_BLOCK" \
  --argjson addresses "$ADDRESSES_JSON" \
  '{chainId: $chainId, deployer: $deployer, buddyNftBlock: $buddyNftBlock, addresses: $addresses}' \
  > "$OUT_FILE"

echo "wrote $OUT_FILE"

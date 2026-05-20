#!/usr/bin/env bash
# Seed local anvil with curated demo buddies via `script/SeedAnvil.s.sol`.
#
# Usage: seed-anvil.sh [<rpc-url>]
#   <rpc-url>    defaults to http://127.0.0.1:8545
#
# Pre-req: anvil running and contracts deployed (`tools/deploy/deploy.sh`).
# Idempotent — re-running skips already-hatched UUIDs.
set -euo pipefail

RPC_URL="${1:-http://127.0.0.1:8545}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

for cmd in forge cast; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    exit 1
  fi
done

CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
if [[ "$CHAIN_ID" != "31337" ]]; then
  echo "error: seed-anvil targets chain 31337, got $CHAIN_ID" >&2
  exit 1
fi

# Anvil acct #0 (default mnemonic). Matches tools/deploy/deploy.sh.
ANVIL_ACCT0_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
if [[ -z "${PRIVATE_KEY:-}" ]]; then
  PRIVATE_KEY="$ANVIL_ACCT0_KEY"
fi
export PRIVATE_KEY

cd "$ONCHAIN_DIR"

forge script script/SeedAnvil.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast

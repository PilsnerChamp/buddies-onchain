#!/usr/bin/env bash
# Wrap `forge script Deploy.s.sol --broadcast` + extract-deployment.
#
# Usage: deploy.sh <rpc-url> [<chain-id>]
#   <rpc-url>    e.g. http://127.0.0.1:8545 (anvil) or https://sepolia.base.org
#   <chain-id>   optional; queried via `cast chain-id` against <rpc-url> when omitted
#
# Behavior:
#   - On chain 31337 (anvil), defaults PRIVATE_KEY to anvil acct #0 if unset, and
#     refuses to proceed if PRIVATE_KEY is set to anything OTHER than the canonical
#     anvil acct #0 key (loud failure). This enforces the determinism contract from
#     docs/onchain/build.md: deployer = acct #0, BuddyNFT at
#     nonce 4, addresses byte-identical across machines.
#   - On all other chains, PRIVATE_KEY must be provided in the environment.
#   - After a successful broadcast, runs extract-deployment.sh to refresh
#     onchain/deployments/<chain-id>.json from the broadcast log.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $(basename "$0") <rpc-url> [<chain-id>]" >&2
  exit 2
fi

RPC_URL="$1"
CHAIN_ID="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ONCHAIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

for cmd in forge cast; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command not found: $cmd" >&2
    exit 1
  fi
done

if [[ -z "$CHAIN_ID" ]]; then
  CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
fi

# Anvil acct #0 (default mnemonic). Deterministic baseline per docs/onchain/build.md.
ANVIL_ACCT0_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

if [[ "$CHAIN_ID" == "31337" ]]; then
  if [[ -z "${PRIVATE_KEY:-}" ]]; then
    PRIVATE_KEY="$ANVIL_ACCT0_KEY"
    echo "info: chain 31337 — defaulting PRIVATE_KEY to anvil acct #0"
  elif [[ "$PRIVATE_KEY" != "$ANVIL_ACCT0_KEY" ]]; then
    echo "error: chain 31337 requires the canonical anvil acct #0 key for deterministic addresses." >&2
    echo "       Unset PRIVATE_KEY to use the default, or run against a non-31337 chain." >&2
    exit 1
  fi
  export PRIVATE_KEY
else
  if [[ -z "${PRIVATE_KEY:-}" ]]; then
    echo "error: PRIVATE_KEY must be set in the environment for chain $CHAIN_ID" >&2
    exit 1
  fi
fi

cd "$ONCHAIN_DIR"

forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --slow

"$SCRIPT_DIR/extract-deployment.sh" "$CHAIN_ID"

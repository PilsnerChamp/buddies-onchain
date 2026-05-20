#!/bin/sh
# buddy-onchain statusline badge for Claude Code.
#
# Reads only the cached buddy state. It never calls the chain, never shells out
# to plugin code, and never echoes untrusted bytes. Missing, malformed,
# oversized, or symlinked state silently renders nothing.

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
STATE="$CLAUDE_DIR/plugins/buddy-onchain/.buddy-state"

[ -h "$STATE" ] && exit 0
[ -f "$STATE" ] || exit 0
[ -r "$STATE" ] || exit 0

bytes=$(wc -c < "$STATE" 2>/dev/null) || exit 0
set -- $bytes
bytes=${1:-}
case "$bytes" in
  ''|*[!0-9]*) exit 0 ;;
esac
[ "$bytes" -le 8192 ] || exit 0

TEXT=$(head -c 8192 "$STATE" 2>/dev/null | tr -d '\000-\037') || exit 0

case "$TEXT" in
  \{*\}) ;;
  *) exit 0 ;;
esac

mode=$(printf '%s' "$TEXT" |
  sed -n 's/.*"mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  head -n 1)
hatch=$(printf '%s' "$TEXT" |
  sed -n 's/.*"hatch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
  head -n 1)

case "$mode" in
  off|lite|full) ;;
  *) exit 0 ;;
esac

case "$hatch" in
  unknown|cold|warm) ;;
  *) exit 0 ;;
esac

env_mode=$(printf '%s' "${BUDDY_MODE:-}" |
  tr -d '\000-\037' |
  tr '[:upper:]' '[:lower:]')

case "$env_mode" in
  off|lite|full) effective_mode="$env_mode" ;;
  *) effective_mode="$mode" ;;
esac

case "$hatch" in
  warm) eyes='@,@' ;;
  cold|unknown) eyes='-,-' ;;
  *) exit 0 ;;
esac

printf '\033[34m[%s:%s]\033[0m' "$eyes" "$effective_mode"

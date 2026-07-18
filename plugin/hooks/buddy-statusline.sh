#!/bin/sh
# buddy-onchain statusline badge for Claude Code.
#
# Reads only the cached buddy state. It never calls the chain, never shells out
# to plugin code, and never echoes untrusted bytes. Missing, malformed,
# oversized, or symlinked state silently renders nothing.
#
# Heartbeat writes: it touches the global badge heartbeat AND a per-project
# one (project dir parsed from the statusline stdin payload) so
# `/buddy-onchain` and SessionStart can tell the badge participates in the
# live status bar — globally and in this specific project (the rendered bar
# itself is TUI chrome nothing can read back). Touched before any state
# validation — heartbeat means "this script runs in the statusline loop",
# not "badge visible". Best-effort; a symlinked or non-regular heartbeat is
# never touched.

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DATA_DIR="$CLAUDE_DIR/plugins/buddy-onchain"
STATE="$DATA_DIR/.buddy-state"

# Refuse symlinks AND existing non-regular files: touching a directory would
# succeed but never satisfy the reader, and opening a FIFO for write could
# block the statusline render. Check-then-touch has an inherent TOCTOU
# window; accepted — anyone who can swap files inside $CLAUDE_DIR already
# controls settings.json and the state file this script trusts. Same
# accepted pattern as the state read.
touch_heartbeat() {
  if [ ! -h "$1" ] && { [ ! -e "$1" ] || [ -f "$1" ]; }; then
    mkdir -p "${1%/*}" 2>/dev/null || :
    touch "$1" 2>/dev/null || :
  fi
}

touch_heartbeat "$DATA_DIR/.badge-heartbeat"

# Per-project heartbeat. Claude Code pipes a JSON payload on stdin;
# `workspace.project_dir` here and `CLAUDE_PROJECT_DIR` in the plugin's hook
# process carry the same directory string, and both sides key it the same
# way: first 16 hex chars of sha256 (plugin-paths.ts::projectBadgeHeartbeatPath).
# Every step is best-effort — no stdin, no sha tool, or an unparseable path
# just skips the touch; the global heartbeat above already fired.
project_dir=""
if [ ! -t 0 ]; then
  # `head -c` returns at EOF or the 1 MiB bound — it assumes the writer
  # closes stdin (Claude Code does). A composition wrapper that holds the
  # pipe open without EOF would stall this read until the statusline runner
  # cancels the render; wrappers must pipe-and-close (see hooks/README.md).
  # Truncation at the bound is tolerable here (unlike the ps1 JSON parse):
  # sed extracts project_dir from a prefix, and workspace fields sit early
  # in the payload.
  stdin_json=$(head -c 1048576 2>/dev/null | tr -d '\000-\037') || stdin_json=""
  case "$stdin_json" in
    *'"project_dir"'*)
      project_dir=$(printf '%s' "$stdin_json" |
        sed -n 's/.*"project_dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
        head -n 1)
      ;;
  esac
fi
# A backslash means JSON escapes this naive parse cannot round-trip —
# hashing the mangled string would never match the reader's key. Skip.
case "$project_dir" in
  *\\*) project_dir="" ;;
esac
if [ -n "$project_dir" ]; then
  key=""
  if command -v sha256sum >/dev/null 2>&1; then
    key=$(printf '%s' "$project_dir" | sha256sum 2>/dev/null | cut -c1-16)
  elif command -v shasum >/dev/null 2>&1; then
    key=$(printf '%s' "$project_dir" | shasum -a 256 2>/dev/null | cut -c1-16)
  elif command -v openssl >/dev/null 2>&1; then
    key=$(printf '%s' "$project_dir" | openssl dgst -sha256 2>/dev/null |
      sed -n 's/.*= *//p' | cut -c1-16)
  fi
  case "$key" in
    *[!0-9a-f]*) key="" ;;
    ????????????????) ;;
    *) key="" ;;
  esac
  if [ -n "$key" ]; then
    touch_heartbeat "$DATA_DIR/projects/$key/.badge-heartbeat"
  fi
fi

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

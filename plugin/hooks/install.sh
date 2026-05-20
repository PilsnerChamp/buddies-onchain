#!/bin/sh
# Install the buddy-onchain statusline badge into Claude Code settings.json.
#
# The installer owns only a statusLine command containing "buddy-statusline.sh".
# Existing foreign statuslines are preserved unless --force is passed.

set -u

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    *)
      echo "Usage: sh install.sh [--force]" >&2
      exit 2
      ;;
  esac
done

script_dir=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd -P) || exit 2
statusline_script="$script_dir/buddy-statusline.sh"

if command -v realpath >/dev/null 2>&1; then
  statusline_path=$(realpath "$statusline_script") || exit 2
elif command -v readlink >/dev/null 2>&1; then
  statusline_path=$(readlink -f "$statusline_script") || exit 2
else
  echo "Cannot resolve absolute path for $statusline_script" >&2
  exit 2
fi

[ -f "$statusline_path" ] || {
  echo "Missing statusline script: $statusline_path" >&2
  exit 2
}

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

mkdir -p "$CLAUDE_DIR" || exit 2

if [ -h "$SETTINGS" ]; then
  echo "Refusing symlinked settings.json: $SETTINGS" >&2
  exit 2
fi

if [ ! -f "$SETTINGS" ]; then
  printf '{}\n' > "$SETTINGS" || exit 2
fi

bytes=$(wc -c < "$SETTINGS" 2>/dev/null) || exit 2
if [ "$bytes" -gt 65536 ]; then
  echo "settings.json is too large to patch safely: $SETTINGS" >&2
  exit 2
fi

run_js() {
  if command -v node >/dev/null 2>&1; then
    node -e "$1"
    return $?
  fi

  if command -v bun >/dev/null 2>&1; then
    bun --eval "$1"
    return $?
  fi

  echo "Need node or bun to safely patch settings.json" >&2
  return 2
}

INSTALL_JS='
const fs = require("fs");

const settingsPath = process.env.BUDDY_SETTINGS;
const statuslinePath = process.env.BUDDY_STATUSLINE;
const force = process.env.BUDDY_FORCE === "1";
// Both markers count as buddy-managed: WSL/cross-platform users may have
// previously installed via install.ps1, in which case re-running install.sh
// rewrites to the .sh binding. Single buddy-managed entry per host platform.
const SH_MARKER = "buddy-statusline.sh";
const PS_MARKER = "buddy-statusline.ps1";

function isBuddyManaged(command) {
  return command.includes(SH_MARKER) || command.includes(PS_MARKER);
}

function isCurrentPlatformBinding(command) {
  return command.includes(SH_MARKER);
}

function fail(message, code) {
  console.error(message);
  process.exit(code);
}

function commandFromStatusLine(statusLine) {
  if (typeof statusLine === "string") {
    return statusLine;
  }

  if (statusLine && typeof statusLine === "object") {
    return typeof statusLine.command === "string" ? statusLine.command : "";
  }

  return "";
}

function quoteForShell(path) {
  return path.replace(/(["\\$`])/g, "\\$1");
}

let settings;
try {
  const raw = fs.readFileSync(settingsPath, "utf8");
  settings = JSON.parse(raw);
} catch (error) {
  fail(`Failed to parse ${settingsPath}: ${error.message}`, 2);
}

if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
  fail(`settings.json must be a JSON object: ${settingsPath}`, 2);
}

const hasStatusLine = Object.prototype.hasOwnProperty.call(settings, "statusLine");
const command = hasStatusLine ? commandFromStatusLine(settings.statusLine) : "";

if (hasStatusLine && isCurrentPlatformBinding(command)) {
  console.log("buddy-onchain statusline already installed");
  process.exit(0);
}

if (hasStatusLine && !isBuddyManaged(command) && !force) {
  console.error(`Foreign statusline detected at ${settingsPath}; pass --force to overwrite. Backup will be saved to ${settingsPath}.bak`);
  process.exit(1);
}

// Backup before overwrite for both --force foreign overwrite and
// cross-platform buddy-managed rebinding.
if (fs.existsSync(settingsPath) && (force || isBuddyManaged(command))) {
  fs.copyFileSync(settingsPath, `${settingsPath}.bak`);
}

settings.statusLine = {
  type: "command",
  command: `bash "${quoteForShell(statuslinePath)}"`,
};

// Direct write — atomic rename hides the change from Claude Code statusLine
// inotify watcher mid-session, leaving install effect invisible until next
// launch. Matches uninstall.sh which always wrote directly. Same risk profile
// as install.ps1 Set-Content.
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`buddy-onchain statusline installed at ${settingsPath}`);
'

export BUDDY_SETTINGS="$SETTINGS"
export BUDDY_STATUSLINE="$statusline_path"
export BUDDY_FORCE="$FORCE"

run_js "$INSTALL_JS"
exit $?

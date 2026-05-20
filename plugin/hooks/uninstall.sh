#!/bin/sh
# Remove the buddy-onchain statusline badge from Claude Code settings.json.
#
# Only statusLine commands containing a buddy-statusline script are removed.
# Foreign statuslines are left untouched.

set -u

if [ "$#" -ne 0 ]; then
  echo "Usage: sh uninstall.sh" >&2
  exit 2
fi

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

[ -e "$SETTINGS" ] || {
  echo "buddy-onchain statusline not installed"
  exit 0
}

if [ -h "$SETTINGS" ]; then
  echo "Refusing symlinked settings.json: $SETTINGS" >&2
  exit 2
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

UNINSTALL_JS='
const fs = require("fs");

const settingsPath = process.env.BUDDY_SETTINGS;
const SH_MARKER = "buddy-statusline.sh";
const PS_MARKER = "buddy-statusline.ps1";

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

function isBuddyManaged(command) {
  return command.includes(SH_MARKER) || command.includes(PS_MARKER);
}

let settings;
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (error) {
  fail(`Failed to parse ${settingsPath}: ${error.message}`, 2);
}

if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
  fail(`settings.json must be a JSON object: ${settingsPath}`, 2);
}

const hasStatusLine = Object.prototype.hasOwnProperty.call(settings, "statusLine");
const command = hasStatusLine ? commandFromStatusLine(settings.statusLine) : "";

if (hasStatusLine && isBuddyManaged(command)) {
  delete settings.statusLine;
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log("buddy-onchain statusline removed");
  process.exit(0);
}

console.log("buddy-onchain statusline not installed");
'

export BUDDY_SETTINGS="$SETTINGS"

run_js "$UNINSTALL_JS"
exit $?

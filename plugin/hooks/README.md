# buddy-onchain hooks

These hooks ship with the `buddy-onchain` Claude Code plugin and activate automatically when the plugin is installed via the marketplace. The three Claude Code hooks (SessionStart, UserPromptSubmit, Stop) wire through `plugin.json`; the statusline badge is the only piece that touches `~/.claude/settings.json`.

If you installed the plugin standalone (cloned the repo, loaded via `claude --plugin-dir <repo>/plugin`), use `sh plugin/hooks/install.sh` to wire the statusline manually.

## What's in this directory

| File | Role |
|---|---|
| `buddy-statusline.sh` | POSIX statusline badge — reads `.buddy-state`, emits `[<eyes>:<mode>]` (e.g. `[@,@:full]`, `[-,-:lite]`), touches the badge heartbeats (global + per-project) |
| `buddy-statusline.ps1` | Windows / PowerShell parity |
| `install.sh` / `install.ps1` | Idempotent statusline installer for `~/.claude/settings.json` |
| `uninstall.sh` / `uninstall.ps1` | Removes only buddy-managed entries |

The SessionStart, UserPromptSubmit, and Stop hooks are NOT in this directory — they ship via `plugin/.claude-plugin/plugin.json` and load automatically with the plugin.

## Statusline badge

Shows which buddy state is active directly in the Claude Code status bar:

Two axes: eyes encode hatch state (`@,@` warm, `-,-` cold/unknown), suffix encodes mode (`off` / `lite` / `full`).

| Badge | Meaning |
|---|---|
| `[@,@:full]` | warm + every-prompt mode |
| `[@,@:lite]` | warm + every-3rd mode |
| `[-,-:full]` | not-yet-hatched + every-prompt mode |
| `[-,-:lite]` | not-yet-hatched + every-3rd mode |
| `[<eyes>:off]` | mode muted (state preference or `BUDDY_MODE=off` env) |

**Plugin users:** when SessionStart finds no badge heartbeat at all (this project or anywhere on the machine — see below), it emits a setup nudge and Claude offers to wire the badge for you. Accept the offer and you're done.

If you already have a custom statusline, the plugin leaves it alone — the nudge (and Claude) will offer the compose snippets below instead of replacing it.

**Standalone users:** `install.sh` / `install.ps1` wires the statusline automatically when no `statusLine` exists. If a foreign statusline is already wired, the installer skips with a stderr warning — your config stays untouched. Pass `--force` to overwrite (creates a `.bak`).

## Badge heartbeat (how the plugin detects a missing badge)

The rendered status bar is TUI chrome — no hook or script can read it back. So the badge script proves its own presence: every render it touches two heartbeat files (mtime only, content empty, best-effort, symlinks never followed):

- `<CLAUDE_CONFIG_DIR>/plugins/buddy-onchain/.badge-heartbeat` — global: "the badge renders somewhere on this machine".
- `<CLAUDE_CONFIG_DIR>/plugins/buddy-onchain/projects/<key>/.badge-heartbeat` — per-project: "the badge renders in THIS project". `<key>` is the first 16 hex chars of sha256 of the project dir, which the script reads from the statusline stdin payload (`workspace.project_dir`).

Statusline renders are event-driven (nothing re-renders during idle gaps), so detection is by **existence**, not mtime — only a heartbeat file that has never been created counts as a miss. Two consumers:

- `/buddy-onchain` checks the per-project heartbeat. Never created → the lookup card appends a `statusline:` warning with the script path and points here for the composition snippets. Per-project, so a badge rendering in another open session can't mask a project whose own `.claude/settings.json` statusline shadows the badge.
- SessionStart nudges only when *neither* heartbeat exists — a badge that provably rendered elsewhere stays quiet on the first boot in a new project (no project heartbeat exists yet); the slash lookup is the precise per-project surface.

Trade-off: removing a once-wired statusline leaves its heartbeats behind, so the plugin will not re-nag — delete the state files (see Uninstall) for a clean reset.

Composing your own statusline? Option 1 below fires both heartbeats automatically (you call the script — forward stdin so it sees the project dir, and close the pipe so the script sees EOF). Option 2 inlines the badge logic, so its snippet includes the heartbeat touches — keep those lines, or the plugin will think the badge is gone and nag you.

## Manual setup (replace whatever's there)

If you want to configure it yourself or replace an existing statusline, wire the **version-stable copy** the plugin maintains in its data dir — SessionStart and `/buddy-onchain` refresh it from every installed plugin version, so it survives updates:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"$HOME/.claude/plugins/buddy-onchain/buddy-statusline.sh\""
  }
}
```

Windows:

```json
{
  "statusLine": {
    "type": "command",
    "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\<you>\\.claude\\plugins\\buddy-onchain\\buddy-statusline.ps1\""
  }
}
```

(Use your literal home path on Windows — the statusline shell does not expand `%USERPROFILE%`. `CLAUDE_CONFIG_DIR` overrides `~/.claude` if you've moved your config dir.)

Do NOT wire the marketplace cache path (`…/cache/<marketplace>/<plugin>/<version>/hooks/…`) — it is version-pinned and goes stale or dead on the next plugin update. For repo dev installs, `<repo-root>/plugin/hooks/buddy-statusline.{sh,ps1}` is fine — a working copy tracks the source directly.

## Custom statusline (compose with your own script)

Two ways to embed the buddy badge into a script you already maintain:

**Windows note:** the statusline re-runs on every redraw, so a per-redraw process spawn shows up. Option 1 shells out to `buddy-statusline.ps1`, and a cold PowerShell start costs ~280 ms — enough to feel sluggish in the bar. On Windows, prefer Option 2 (inline the logic in your own script's language — no subprocess). On POSIX the `sh` spawn in Option 1 is a few ms, so either option is fine.

### Option 1 — call the buddy script

Simplest. The buddy statusline outputs nothing on missing/corrupt/symlinked state, so it's safe to interpolate anywhere. Forward the statusline stdin JSON you already read — that's how the buddy script learns the project dir for the per-project heartbeat (without it, only the global heartbeat fires and `/buddy-onchain` will nag in this project):

```bash
# inside your custom statusline script
statusline_json=$(cat)   # you likely already read this for your own fields
your_existing_left_part="..."
buddy_badge=$(printf '%s' "$statusline_json" | bash "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/buddy-onchain/buddy-statusline.sh")
your_existing_right_part="..."

printf '%s %s %s\n' "$your_existing_left_part" "$buddy_badge" "$your_existing_right_part"
```

The buddy script honors `BUDDY_MODE` env override and `CLAUDE_CONFIG_DIR`. Composes cleanly.

### Option 2 — inline the badge logic

Embed buddy's parsing directly so you have zero external dependency. Mirrors `buddy-statusline.sh` (see that file for the canonical version):

```bash
buddy_text=""
buddy_data_dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/buddy-onchain"
buddy_state="$buddy_data_dir/.buddy-state"
# Badge heartbeats — let the plugin detect the badge is wired. Keep these
# lines: without them the plugin warns the badge is missing. Global file:
buddy_touch_heartbeat() {
  if [ ! -h "$1" ] && { [ ! -e "$1" ] || [ -f "$1" ]; }; then
    mkdir -p "${1%/*}" 2>/dev/null || :
    touch "$1" 2>/dev/null || :
  fi
}
buddy_touch_heartbeat "$buddy_data_dir/.badge-heartbeat"
# Per-project file — set $buddy_project_dir from the statusline stdin JSON
# (`workspace.project_dir`), which your script has likely already parsed.
# Key = first 16 hex chars of sha256 of the project dir string. Keep the
# full sha-tool fallback chain — macOS ships `shasum`, not `sha256sum`.
if [ -n "$buddy_project_dir" ]; then
  buddy_key=""
  if command -v sha256sum >/dev/null 2>&1; then
    buddy_key=$(printf '%s' "$buddy_project_dir" | sha256sum | cut -c1-16)
  elif command -v shasum >/dev/null 2>&1; then
    buddy_key=$(printf '%s' "$buddy_project_dir" | shasum -a 256 | cut -c1-16)
  elif command -v openssl >/dev/null 2>&1; then
    buddy_key=$(printf '%s' "$buddy_project_dir" | openssl dgst -sha256 | sed -n 's/.*= *//p' | cut -c1-16)
  fi
  case "$buddy_key" in
    *[!0-9a-f]*|"") ;;
    ????????????????) buddy_touch_heartbeat "$buddy_data_dir/projects/$buddy_key/.badge-heartbeat" ;;
  esac
fi
if [ ! -h "$buddy_state" ] && [ -r "$buddy_state" ]; then
  buddy_raw=$(head -c 8192 "$buddy_state" 2>/dev/null | tr -d '\000-\037')
  case "$buddy_raw" in
    \{*\})
      buddy_mode=$(printf '%s' "$buddy_raw" | sed -n 's/.*"mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
      buddy_hatch=$(printf '%s' "$buddy_raw" | sed -n 's/.*"hatch"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
      case "$buddy_mode" in off|lite|full) ;; *) buddy_mode="" ;; esac
      case "$buddy_hatch" in unknown|cold|warm) ;; *) buddy_hatch="" ;; esac
      if [ -n "$buddy_mode" ] && [ -n "$buddy_hatch" ]; then
        buddy_env=$(printf '%s' "${BUDDY_MODE:-}" | tr -d '\000-\037' | tr '[:upper:]' '[:lower:]')
        case "$buddy_env" in
          off|lite|full) buddy_effective="$buddy_env" ;;
          *) buddy_effective="$buddy_mode" ;;
        esac
        case "$buddy_hatch" in
          warm) buddy_eyes='@,@' ;;
          cold|unknown) buddy_eyes='-,-' ;;
        esac
        buddy_text=$(printf '\033[34m[%s:%s]\033[0m' "$buddy_eyes" "$buddy_effective")
      fi
      ;;
  esac
fi
# now $buddy_text is empty (silent) or contains the colored badge
```

PowerShell parity available in `buddy-statusline.ps1` if you need an inline version for a Windows custom script.

## Why we don't auto-merge into existing statuslines

Claude Code's `statusLine.command` is a single shell command. Composing multiple plugins' badges by parsing and rewriting an existing command is fragile (escapes nest, alignment breaks, multi-plugin order surprises) and reversibility is messy at uninstall. So buddy follows the prevailing Anthropic-plugin pattern: respect your config, give you the snippets, let you compose explicitly.

If Claude Code ever adds first-class statusline composition (e.g. `statusLine.parts: [...]`), we'll wire it.

## Uninstall

```sh
sh plugin/hooks/uninstall.sh        # POSIX
powershell -ExecutionPolicy Bypass -File plugin/hooks/uninstall.ps1   # Windows
```

Removes the buddy-managed `statusLine` only. Foreign statuslines are left alone. State files at `~/.claude/plugins/buddy-onchain/` (`.buddy-state`, `.buddy-art-cache.json`, `.badge-heartbeat`, `buddy-statusline.{sh,ps1}`, `projects/`) are NOT touched — delete them by hand if you want a fully clean reset.

# buddy-onchain hooks

These hooks ship with the `buddy-onchain` Claude Code plugin and activate automatically when the plugin is installed via the marketplace. The three Claude Code hooks (SessionStart, UserPromptSubmit, Stop) wire through `plugin.json`; the statusline badge is the only piece that touches `~/.claude/settings.json`.

If you installed the plugin standalone (cloned the repo, loaded via `claude --plugin-dir <repo>/plugin`), use `sh plugin/hooks/install.sh` to wire the statusline manually.

## What's in this directory

| File | Role |
|---|---|
| `buddy-statusline.sh` | POSIX statusline badge — reads `.buddy-state`, emits `[<eyes>:<mode>]` (e.g. `[@,@:full]`, `[-,-:lite]`) |
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

**Plugin users:** if you have no `statusLine` configured, SessionStart's first run emits a setup nudge and Claude offers to wire it for you. Accept the offer and you're done.

If you already have a custom statusline, the plugin leaves it alone. Add the buddy badge to your script using one of the snippets below.

**Standalone users:** `install.sh` / `install.ps1` wires the statusline automatically when no `statusLine` exists. If a foreign statusline is already wired, the installer skips with a stderr warning — your config stays untouched. Pass `--force` to overwrite (creates a `.bak`).

## Manual setup (replace whatever's there)

If you want to configure it yourself or replace an existing statusline:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash \"/absolute/path/to/buddy-statusline.sh\""
  }
}
```

Windows:

```json
{
  "statusLine": {
    "type": "command",
    "command": "powershell -ExecutionPolicy Bypass -File \"C:\\absolute\\path\\to\\buddy-statusline.ps1\""
  }
}
```

The plugin install location is platform-specific. For dev installs, the path is `<repo-root>/plugin/hooks/buddy-statusline.{sh,ps1}`.

## Custom statusline (compose with your own script)

Two ways to embed the buddy badge into a script you already maintain:

### Option 1 — call the buddy script

Simplest. The buddy statusline outputs nothing on missing/corrupt/symlinked state, so it's safe to interpolate anywhere:

```bash
# inside your custom statusline script
your_existing_left_part="..."
buddy_badge=$(bash /absolute/path/to/buddy-statusline.sh)
your_existing_right_part="..."

printf '%s %s %s\n' "$your_existing_left_part" "$buddy_badge" "$your_existing_right_part"
```

The buddy script honors `BUDDY_MODE` env override and `CLAUDE_CONFIG_DIR`. Composes cleanly.

### Option 2 — inline the badge logic

Embed buddy's parsing directly so you have zero external dependency. Mirrors `buddy-statusline.sh` (see that file for the canonical version):

```bash
buddy_text=""
buddy_state="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/buddy-onchain/.buddy-state"
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

Removes the buddy-managed `statusLine` only. Foreign statuslines are left alone. State files at `~/.claude/plugins/buddy-onchain/` (`.buddy-state`, `.buddy-art-cache.json`, `projects/`) are NOT touched — delete them by hand if you want a fully clean reset.

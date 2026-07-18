#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Status line: model + context %, git branch, buddy badge.

Reads status JSON from stdin, prints a single line like:

    [Opus 4.7 (3%)] | 🌿 main | [-,-:full]
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


# ANSI
BLUE = "\033[34m"
GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"


def _dict(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def _str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _path_from_data_env(
    data_value: object,
    env_name: str,
    default: Path | None = None,
) -> Path | None:
    raw = _str(data_value) or _str(os.environ.get(env_name))
    return Path(raw).expanduser() if raw else default


def _claude_config_dir(data: dict) -> Path:
    return _path_from_data_env(
        data.get("claude_config_dir"),
        "CLAUDE_CONFIG_DIR",
        Path.home() / ".claude",
    ) or Path.home() / ".claude"


def _project_dir(data: dict) -> Path | None:
    workspace = _dict(data.get("workspace"))
    return _path_from_data_env(
        workspace.get("project_dir"),
        "CLAUDE_PROJECT_DIR",
    )


# Status component helpers all accept data: dict for uniform assembly/resolution.
def model_label(data: dict) -> str | None:
    model = _dict(data.get("model"))
    name = re.sub(
        r"\s*\(1M context\)",
        "",
        _str(model.get("display_name")) or "Claude",
    )
    ctx = _dict(data.get("context_window"))
    pct = ctx.get("used_percentage")
    if pct is None:
        size = ctx.get("context_window_size") or 0
        usage = _dict(ctx.get("current_usage"))
        try:
            used = (
                usage.get("input_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0)
            )
            pct = (used / size * 100) if size > 0 else 0
        except TypeError:
            return None
    try:
        pct_int = int(pct)
    except (TypeError, ValueError, OverflowError):
        return None
    return f"{BLUE}[{name} ({pct_int}%)]{RESET}"


def git_branch(data: dict) -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (subprocess.SubprocessError, OSError):
        return None
    if result.returncode != 0:
        return None
    branch = result.stdout.strip()
    return f"{GREEN}🌿 {branch}{RESET}" if branch else None


def buddy_badge(data: dict) -> str | None:
    project = _project_dir(data)
    if not project:
        return None
    script = project / "plugin" / "hooks" / "buddy-statusline.sh"
    if not script.is_file():
        return None
    try:
        out = subprocess.run(
            ["bash", str(script)],
            # Forward the statusline payload: the badge script reads
            # workspace.project_dir from stdin to write its per-project
            # heartbeat (missing heartbeat = /buddy-onchain nags here).
            input=json.dumps(data),
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout.strip()
    except (subprocess.SubprocessError, OSError):
        return None
    return out or None


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        print(f"{RED}[Claude] JSON Error{RESET}")
        return
    if not isinstance(data, dict):
        data = {}

    parts = []
    for fn in (model_label, git_branch, buddy_badge):
        val = fn(data)
        if val:
            parts.append(val)

    print(" | ".join(parts))


if __name__ == "__main__":
    main()

#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["python-dotenv"]
# ///
"""
Claude Code Setup Hook: Shared Project Initialization

Triggered by: claude --init (in any project directory)
Purpose: Shared setup steps for both main repo and worktrees.

Worktree env seeding and optional project customization are owned by the
pilsner-champ-tools terminal plugin's Setup runner (setup_repo.py); this hook
no longer probes for a copied setup_worktree.py module. Project-specific
worktree setup, when needed, belongs in `.claude/hooks/setup_project.py`.

This hook is permanent and idempotent — safe to re-run on any `claude --init-only`.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
LOG_FILE = SCRIPT_DIR / "setup.log"
REPO_ROOT = SCRIPT_DIR.parent.parent


# =============================================================================
# Logger
# =============================================================================

class Logger:
    def __init__(self, log_path: Path):
        self.log_path = log_path
        with open(self.log_path, "w") as f:
            f.write(f"=== Setup Started: {datetime.now().isoformat()} ===\n")

    def log(self, message: str) -> None:
        print(message, file=sys.stderr)
        with open(self.log_path, "a") as f:
            f.write(message + "\n")


# =============================================================================
# Git Helpers
# =============================================================================

def is_worktree() -> bool:
    """Check if current directory is a git worktree (not the main repo)."""
    git_dir = subprocess.run(
        ["git", "rev-parse", "--git-dir"],
        capture_output=True, text=True, check=True
    ).stdout.strip()
    git_common_dir = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        capture_output=True, text=True, check=True
    ).stdout.strip()
    return git_dir != git_common_dir


def get_main_repo_path() -> Path:
    """Get the path to the main repository from a worktree.

    Uses: dirname $(git rev-parse --git-common-dir)
    """
    git_common_dir = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        capture_output=True, text=True, check=True
    ).stdout.strip()
    return Path(git_common_dir).parent


# =============================================================================
# Filesystem Helpers
# =============================================================================

def atomic_write_text(path: Path, content: str) -> None:
    """Write text to `path` atomically via tempfile + os.replace.

    Avoids torn writes if the process is interrupted mid-write or two setup
    runs race on the same file. The replace is atomic on POSIX as long as the
    temp file lives on the same filesystem (we put it in path.parent).
    """
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as f:
            f.write(content)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


# =============================================================================
# Main
# =============================================================================

def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    logger = Logger(LOG_FILE)
    actions = []
    project_dir = Path.cwd()
    worktree = is_worktree()
    main_repo = get_main_repo_path() if worktree else project_dir
    context = "worktree" if worktree else "main repo"
    setup_context = f"(dry-run) {context}" if dry_run else context

    try:
        logger.log(f"\n>>> Setup context: {setup_context}")
        logger.log(f"  Project dir: {project_dir}")
        if worktree:
            logger.log(f"  Main repo: {main_repo}")

        # Worktree env seeding and project customization run in the terminal
        # plugin's Setup runner; this hook owns only shared repo steps.

        # --- Summary ---
        complete_message = f"{'(dry-run) ' if dry_run else ''}Setup complete ({context})!"
        logger.log("\n" + "=" * 60)
        logger.log(complete_message)
        logger.log("=" * 60)

        summary = f"{complete_message}\n\n"
        summary += "Actions performed:\n"
        for action in actions:
            summary += f"  - {action}\n"

        output = {
            "hookSpecificOutput": {
                "hookEventName": "Setup",
                "additionalContext": summary
            }
        }
        print(json.dumps(output, indent=2))

    except Exception as e:
        logger.log(f"\nERROR: {e}")
        error_output = {
            "hookSpecificOutput": {
                "hookEventName": "Setup",
                "additionalContext": f"Setup failed: {e}\n\nCheck log at: {LOG_FILE}"
            }
        }
        print(json.dumps(error_output, indent=2))
        sys.exit(2)


if __name__ == "__main__":
    main()

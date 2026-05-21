#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["python-dotenv"]
# ///
"""
Claude Code Setup Hook: Shared Project Initialization

Triggered by: claude --init (in any project directory)
Purpose: Shared setup steps for both main repo and worktrees.

When a worktree-specific setup_worktree.py module exists alongside this script,
it is dynamically imported and called for worktree-only initialization steps
(port isolation, per-worktree env files, scratch DB bootstrap, etc.). The
worktree module is a private extension point — drop a `setup_worktree.py`
beside this file to opt in. Without it, the hook is a no-op for worktrees.

This hook is permanent and idempotent — safe to re-run on any `claude --init-only`.
"""

import importlib.util
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

        # --- Worktree pre-step: load module and copy .env.local ---
        # .env.local must be copied BEFORE shared steps that may need env vars
        worktree_module = None
        if worktree:
            worktree_hook = SCRIPT_DIR / "setup_worktree.py"
            if worktree_hook.exists():
                logger.log("\n>>> Loading worktree setup module...")
                spec = importlib.util.spec_from_file_location(
                    "setup_worktree", str(worktree_hook)
                )
                worktree_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(worktree_module)
                logger.log("  Loaded setup_worktree.py")

                logger.log("\n>>> Copying environment files from main repo...")
                if dry_run:
                    logger.log("  (dry-run) skipping environment file copy")
                    actions.append("(dry-run) Skipped environment file copy")
                else:
                    actions.extend(worktree_module.copy_env_files(main_repo, logger))
            else:
                logger.log("\n>>> No setup_worktree.py found (already initialized)")

        # --- Worktree-specific steps ---
        if worktree_module is not None:
            logger.log("\n>>> Running worktree-specific setup...")
            if dry_run:
                logger.log("  (dry-run) skipping worktree setup")
                actions.append("(dry-run) Skipped worktree-specific setup")
                worktree_summary = ""
            else:
                worktree_result = worktree_module.run(logger, main_repo, project_dir)
                actions.extend(worktree_result.get("actions", []))
                worktree_summary = worktree_result.get("summary", "")
        else:
            worktree_summary = ""

        # --- Summary ---
        complete_message = f"{'(dry-run) ' if dry_run else ''}Setup complete ({context})!"
        logger.log("\n" + "=" * 60)
        logger.log(complete_message)
        logger.log("=" * 60)

        summary = f"{complete_message}\n\n"
        if worktree_summary:
            summary += worktree_summary + "\n"
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

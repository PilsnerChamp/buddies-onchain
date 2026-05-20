#!/usr/bin/env python3
"""Generate BuddySpriteFontMetrics.sol from the committed sprite font manifest.

Unlike the chrome gen-metrics.py (Iosevka, SCALE=100, pre-scaled to font size),
this generator emits raw font-unit values with no pre-scaling. Consumers compute
SVG pixel values via `(rawMetric * fontSize) / UPEM`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[5]
MANIFEST_PATH = ROOT / "onchain" / "contract-data" / "fonts" / "sprite" / "BuddySpriteFont.manifest.json"
PAYLOAD_PATH = ROOT / "onchain" / "contract-data" / "fonts" / "sprite" / "BuddySpriteFont.woff2"
OUTPUT_PATH = ROOT / "onchain" / "contracts" / "libraries" / "BuddySpriteFontMetrics.sol"


def verify_payload_parity(manifest: dict) -> None:
    """Fail loud if the committed manifest no longer matches the WOFF2 file."""
    if not PAYLOAD_PATH.exists():
        raise SystemExit(f"Payload not found at {PAYLOAD_PATH.relative_to(ROOT)}")

    payload_bytes = PAYLOAD_PATH.read_bytes()
    actual_size = len(payload_bytes)
    actual_sha = hashlib.sha256(payload_bytes).hexdigest()

    expected_size = int(manifest["output"]["sizeBytes"])
    expected_sha = manifest["output"]["sha256"].lower()

    if actual_size != expected_size:
        raise SystemExit(
            f"Manifest/payload size mismatch: manifest={expected_size}, payload={actual_size}"
        )
    if actual_sha != expected_sha:
        raise SystemExit(
            f"Manifest/payload SHA256 mismatch: manifest={expected_sha}, payload={actual_sha}"
        )


def render_library(manifest: dict) -> str:
    raw = manifest["metrics"]["rawValues"]
    output = manifest["output"]

    upem = int(raw["upem"])
    advance = int(raw["advance"])
    ascent = int(raw["ascent"])
    descent = abs(int(raw["descent"]))

    payload_length = int(output["sizeBytes"])
    payload_sha256 = output["sha256"]
    if len(payload_sha256) != 64:
        raise SystemExit(f"Expected 64 hex chars for output.sha256, got {payload_sha256!r}")

    return f'''// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Generated from `onchain/contract-data/fonts/sprite/BuddySpriteFont.manifest.json` by `onchain/contract-data/fonts/sprite/tools/gen-metrics.py`.
/// @dev Do not hand-edit. Run `python3 onchain/contract-data/fonts/sprite/tools/gen-metrics.py --write` after manifest changes.
///      Raw font-unit values — no pre-scaling to a font size or SCALE factor.
///      Consumers compute SVG pixel values via `(rawMetric * fontSize) / UPEM`.
library BuddySpriteFontMetrics {{
    uint256 internal constant UPEM = {upem};
    uint256 internal constant ADVANCE = {advance};
    uint256 internal constant ASCENT = {ascent};
    uint256 internal constant DESCENT = {descent};

    // Manifest-derived payload identity guard for `BuddySpriteFont` constructor inputs.
    uint256 internal constant PAYLOAD_LENGTH = {payload_length};
    bytes32 internal constant PAYLOAD_SHA256 = 0x{payload_sha256};
}}
'''


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate BuddySpriteFontMetrics.sol from the committed sprite font manifest."
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="write the generated file; without this flag the script fails on drift",
    )
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text())
    verify_payload_parity(manifest)
    expected = render_library(manifest)

    if OUTPUT_PATH.exists():
        current = OUTPUT_PATH.read_text()
        if current == expected:
            print(f"BuddySpriteFontMetrics is up to date: {OUTPUT_PATH.relative_to(ROOT)}")
            return 0

        if not args.write:
            print(
                "BuddySpriteFontMetrics drift detected. "
                "Run `python3 onchain/contract-data/fonts/sprite/tools/gen-metrics.py --write` to regenerate the checked-in file.",
                file=sys.stderr,
            )
            return 1
    else:
        if not args.write:
            print(
                "BuddySpriteFontMetrics.sol does not exist yet. "
                "Run `python3 onchain/contract-data/fonts/sprite/tools/gen-metrics.py --write` to create it.",
                file=sys.stderr,
            )
            return 1

    OUTPUT_PATH.write_text(expected)
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

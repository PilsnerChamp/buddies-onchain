#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[5]
MANIFEST_PATH = ROOT / "onchain" / "contract-data" / "fonts" / "chrome" / "BuddyFont.manifest.json"
PAYLOAD_PATH = ROOT / "onchain" / "contract-data" / "fonts" / "chrome" / "BuddyFont.woff2"
OUTPUT_PATH = ROOT / "onchain" / "contracts" / "libraries" / "BuddyFontMetrics.sol"
SCALE = 100


def _decimal(name: str, value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except InvalidOperation as exc:
        raise SystemExit(f"Unsupported metric value for {name}: {value!r}") from exc


def verify_payload_parity(manifest: dict) -> None:
    """Fail loud if the committed manifest no longer matches onchain/contract-data/fonts/chrome/BuddyFont.woff2."""
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


def verify_metric_parity(manifest: dict) -> None:
    """Cross-check decimal metrics against rawValues so a hand-edited manifest can't slip through."""
    metrics = manifest["metrics"]
    raw = metrics["rawValues"]
    upem = _decimal("rawValues.upem", raw["upem"])
    font_size = _decimal("fontSize", metrics["fontSize"])

    def expected(raw_name: str) -> Decimal:
        return _decimal(f"rawValues.{raw_name}", raw[raw_name]) * font_size / upem

    checks = {
        "glyphAdvance": expected("advance"),
        "ascent": expected("ascent"),
        "lineHeight": (_decimal("rawValues.ascent", raw["ascent"])
                       - _decimal("rawValues.descent", raw["descent"])
                       + _decimal("rawValues.lineGap", raw["lineGap"])) * font_size / upem,
    }
    # descent is stored as a positive scalar derived from the negative raw value.
    checks["descent"] = -_decimal("rawValues.descent", raw["descent"]) * font_size / upem

    for key, expected_value in checks.items():
        actual = _decimal(key, metrics[key])
        if actual != expected_value:
            raise SystemExit(
                f"Manifest metric drift: metrics.{key}={actual} != derived-from-rawValues={expected_value}"
            )


def scaled_metric(name: str, value: object) -> int:
    decimal_value = _decimal(name, value)

    scaled = decimal_value * SCALE
    integral = scaled.to_integral_value()
    if scaled != integral:
        raise SystemExit(
            f"Metric {name}={value!r} cannot be represented exactly with SCALE={SCALE}; "
            "increase the fixed-point scale before regenerating."
        )
    return int(integral)


def render_library(manifest: dict) -> str:
    metrics = manifest["metrics"]
    output = manifest["output"]

    font_size = scaled_metric("fontSize", metrics["fontSize"])
    glyph_advance = scaled_metric("glyphAdvance", metrics["glyphAdvance"])
    ascent = scaled_metric("ascent", metrics["ascent"])
    descent = scaled_metric("descent", metrics["descent"])
    line_height = scaled_metric("lineHeight", metrics["lineHeight"])

    payload_length = int(output["sizeBytes"])
    payload_sha256 = output["sha256"]
    if len(payload_sha256) != 64:
        raise SystemExit(f"Expected 64 hex chars for output.sha256, got {payload_sha256!r}")

    return f'''// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Generated from `onchain/contract-data/fonts/chrome/BuddyFont.manifest.json` by `onchain/contract-data/fonts/chrome/tools/gen-metrics.py`.
/// @dev Do not hand-edit. Run `python3 onchain/contract-data/fonts/chrome/tools/gen-metrics.py --write` after manifest changes.
library BuddyFontMetrics {{
    uint256 internal constant SCALE = {SCALE};

    // SVG user units, scaled by `SCALE` to preserve the manifest's decimal precision.
    uint256 internal constant FONT_SIZE = {font_size};
    uint256 internal constant GLYPH_ADVANCE = {glyph_advance};
    uint256 internal constant ASCENT = {ascent};
    uint256 internal constant DESCENT = {descent};
    uint256 internal constant LINE_HEIGHT = {line_height};

    // Manifest-derived payload identity guard for `BuddyFont` constructor inputs.
    uint256 internal constant PAYLOAD_LENGTH = {payload_length};
    bytes32 internal constant PAYLOAD_SHA256 = 0x{payload_sha256};
}}
'''


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate BuddyFontMetrics.sol from the committed manifest.")
    parser.add_argument(
        "--write",
        action="store_true",
        help="write the generated file; without this flag the script fails on drift",
    )
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text())
    verify_payload_parity(manifest)
    verify_metric_parity(manifest)
    expected = render_library(manifest)

    if OUTPUT_PATH.exists():
        current = OUTPUT_PATH.read_text()
        if current == expected:
            print(f"BuddyFontMetrics is up to date: {OUTPUT_PATH.relative_to(ROOT)}")
            return 0

        if not args.write:
            print(
                "BuddyFontMetrics drift detected. "
                "Run `python3 onchain/contract-data/fonts/chrome/tools/gen-metrics.py --write` to regenerate the checked-in file.",
                file=sys.stderr,
            )
            return 1
    else:
        if not args.write:
            print(
                "BuddyFontMetrics.sol does not exist yet. "
                "Run `python3 onchain/contract-data/fonts/chrome/tools/gen-metrics.py --write` to create it.",
                file=sys.stderr,
            )
            return 1

    OUTPUT_PATH.write_text(expected)
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

import { describe, expect, test } from "bun:test";
import {
  applyColdNudge,
  applySleepIndicator,
  COLD_NUDGE_LINE_1,
  COLD_NUDGE_LINE_2,
  SLEEP_INDICATOR_ROW,
} from "../src/sprite-decorations";
import { BODY_FRAME_0 } from "../src/sleeping-atlas";
import type { BuddyStateV4, HatchState } from "../src/buddy-state";
import type { EffectiveState, EffectiveReason } from "../src/effective-state";
import type { Species } from "../src/bone-deriver";

function stateFor(hatch: HatchState): BuddyStateV4 {
  return {
    schemaVersion: 4,
    mode: "full",
    hatch,
    tokenId: hatch === "warm" ? "0x1" : null,
    accountUuidHash: "a".repeat(64),
    chainId: 8453,
    contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    turnCounter: 0,
    coldNudgeCounter: 0,
  };
}

function effectiveFor(reason: EffectiveReason): EffectiveState {
  return {
    effectiveMode: "full",
    reason,
  };
}

describe("applySleepIndicator", () => {
  test("ok + cold + 5-row hatless input replaces row 0 without mutating input", () => {
    const rows = ["", "body 1", "body 2", "body 3", "body 4"];

    const out = applySleepIndicator(
      rows,
      stateFor("cold"),
      effectiveFor("ok"),
    );

    expect(out).not.toBe(rows);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(SLEEP_INDICATOR_ROW);
    expect(rows[0]).toBe("");
  });

  test("ok + cold + 5-row hatted input replaces row 0 and drops hat", () => {
    const rows = ["    [___]", "body 1", "body 2", "body 3", "body 4"];

    const out = applySleepIndicator(
      rows,
      stateFor("cold"),
      effectiveFor("ok"),
    );

    expect(out).not.toBe(rows);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(SLEEP_INDICATOR_ROW);
    expect(rows[0]).toBe("    [___]");
  });

  test("warm input returns unchanged same reference", () => {
    const rows = ["warm 0", "warm 1", "warm 2"];

    const out = applySleepIndicator(
      rows,
      stateFor("warm"),
      effectiveFor("ok"),
    );

    expect(out).toBe(rows);
    expect(out).toEqual(["warm 0", "warm 1", "warm 2"]);
  });

  test("unknown input returns unchanged same reference", () => {
    const rows = ["unknown 0", "unknown 1", "unknown 2"];

    const out = applySleepIndicator(
      rows,
      stateFor("unknown"),
      effectiveFor("ok"),
    );

    expect(out).toBe(rows);
    expect(out).toEqual(["unknown 0", "unknown 1", "unknown 2"]);
  });

  test("identity-mismatch + cold returns unchanged same reference", () => {
    const rows = ["cold 0", "cold 1", "cold 2"];

    const out = applySleepIndicator(
      rows,
      stateFor("cold"),
      effectiveFor("identity-mismatch"),
    );

    expect(out).toBe(rows);
    expect(out).toEqual(["cold 0", "cold 1", "cold 2"]);
  });

  test("empty input returns unchanged same reference", () => {
    const rows: string[] = [];

    const out = applySleepIndicator(
      rows,
      stateFor("cold"),
      effectiveFor("ok"),
    );

    expect(out).toBe(rows);
    expect(out).toEqual([]);
  });

  test.each(Object.keys(BODY_FRAME_0) as Species[])(
    "confirmed-cold path decorates %s rows",
    (species) => {
      const rows = [...BODY_FRAME_0[species]];

      const out = applySleepIndicator(
        rows,
        stateFor("cold"),
        effectiveFor("ok"),
      );

      expect(out).toHaveLength(5);
      expect(out[0]).toBe(SLEEP_INDICATOR_ROW);
    },
  );

  test("SLEEP_INDICATOR_ROW stays 17 chars wide", () => {
    expect(SLEEP_INDICATOR_ROW.length).toBe(17);
  });
});

describe("applyColdNudge", () => {
  test("fire=false returns unchanged rows and null joke overrides", () => {
    const rows = ["row 0", "row 1", "row 2", "row 3", "row 4"];

    const out = applyColdNudge(rows, false, "https://example.test/hatch");

    expect(out.rows).toBe(rows);
    expect(out.jokeOverrides).toEqual([null, null, null, null, null]);
  });

  test("fire=true pre-fills first three joke cells without changing rows", () => {
    const rows = ["row 0", "row 1", "row 2", "row 3", "row 4"];
    const url = "https://example.test/hatch#identityHash=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&prngSeed=123";

    const out = applyColdNudge(rows, true, url);

    expect(out.rows).toBe(rows);
    expect(out.jokeOverrides).toEqual([
      COLD_NUDGE_LINE_1,
      COLD_NUDGE_LINE_2,
      url,
      null,
      null,
    ]);
  });

  test("fire=true with empty input returns empty rows and overrides", () => {
    const rows: string[] = [];

    const out = applyColdNudge(rows, true, "https://example.test/hatch");

    expect(out).toEqual({ rows: [], jokeOverrides: [] });
  });

  test("passes hatch URL through verbatim", () => {
    const url = "https://buddiesonchain.dev/hatch#identityHash=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&prngSeed=123";

    const out = applyColdNudge(["row 0", "row 1", "row 2"], true, url);

    expect(out.jokeOverrides[2]).toBe(url);
  });
});

import { describe, test, expect } from "bun:test";
import { sleepingFrame } from "../src/sleeping-frame";
import { deriveBuddyFromAccount, HATS } from "../src/bone-deriver";
import { BODY_FRAME_0, HAT_ROWS } from "../src/sleeping-atlas";

const SAMPLE_UUID = "00000000-0000-4000-8000-000000000001";

function findHattedUuid(): string | null {
  for (let i = 1; i < 256; i++) {
    const hex = i.toString(16).padStart(12, "0");
    const uuid = `00000000-0000-4000-8000-${hex}`;
    const { bones } = deriveBuddyFromAccount(uuid);
    if (bones.hat !== "none" && BODY_FRAME_0[bones.species][0].trim() === "") {
      return uuid;
    }
  }
  return null;
}

describe("sleepingFrame", () => {
  test("returns frameId fb and 5 rows for a valid uuid", () => {
    const out = sleepingFrame({ accountUuid: SAMPLE_UUID });
    expect(out.frameId).toBe("fb");
    expect(out.rows).toHaveLength(5);
  });

  test("no `0` placeholder survives in any row", () => {
    const out = sleepingFrame({ accountUuid: SAMPLE_UUID });
    for (const row of out.rows) {
      expect(row).not.toContain("0");
    }
  });

  test("at least one row contains the blink glyph `-`", () => {
    const out = sleepingFrame({ accountUuid: SAMPLE_UUID });
    expect(out.rows.some((r) => r.includes("-"))).toBe(true);
  });

  test("rows are right-trimmed (no trailing whitespace)", () => {
    const out = sleepingFrame({ accountUuid: SAMPLE_UUID });
    for (const row of out.rows) {
      expect(row).toBe(row.replace(/\s+$/, ""));
    }
  });

  test("hatted species with blank row 0 injects hat row at row 0", () => {
    const uuid = findHattedUuid();
    expect(uuid).not.toBeNull();
    const { bones } = deriveBuddyFromAccount(uuid!);
    expect(HATS).toContain(bones.hat);
    expect(bones.hat).not.toBe("none");

    const out = sleepingFrame({ accountUuid: uuid! });
    const expectedRow0 = `  ${HAT_ROWS[bones.hat]}  `.replace(/\s+$/, "");
    expect(out.rows[0]).toBe(expectedRow0);
  });

  test("hatless species keeps its native blank row 0 (after right-trim)", () => {
    let foundCommon: string | null = null;
    for (let i = 1; i < 256; i++) {
      const hex = i.toString(16).padStart(12, "0");
      const uuid = `00000000-0000-4000-8000-${hex}`;
      const { bones } = deriveBuddyFromAccount(uuid);
      if (bones.hat === "none" && BODY_FRAME_0[bones.species][0].trim() === "") {
        foundCommon = uuid;
        break;
      }
    }
    expect(foundCommon).not.toBeNull();
    const out = sleepingFrame({ accountUuid: foundCommon! });
    expect(out.rows[0]).toBe("");
  });
});

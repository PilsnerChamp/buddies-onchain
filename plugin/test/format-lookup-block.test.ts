import { describe, test, expect } from "bun:test";
import { formatLookupBlock, type LookupPayload } from "../src/lookup-payload";
import type { ModeLevel } from "../src/buddy-state";

function makeLookupPayload(
  payload: Partial<LookupPayload> &
    Pick<LookupPayload, "buddyStatus">,
): LookupPayload {
  return {
    cardLines: [],
    viewUrl: "https://buddies-onchain.xyz/view/abc",
    hatchUrl: "https://buddies-onchain.xyz/hatch?accountUuid=abc",
    openseaCollectionUrl: null,
    effectiveMode: "lite",
    persistedMode: "lite",
    ...payload,
  };
}

describe("formatLookupBlock", () => {
  const FULL_LINE = "your buddy appears on every user prompt (mode: `full`).";
  const LITE_LINE = "your buddy appears every 3rd prompt (mode: `lite`).";
  const OFF_LINE = "your buddy is silent on prompts (mode: `off`).";
  const CHANGE_HINT = "change: `/buddy-onchain lite|full|off`";

  const decisionCases = [
    {
      name: "warm uses view copy and view URL",
      buddyStatus: "warm" as const,
      message: "go see your buddy onchain:",
      url: "https://buddies-onchain.xyz/view/abc",
    },
    {
      name: "cold uses hatch copy and hatch URL",
      buddyStatus: "cold" as const,
      message: "your buddy is sleeping - hatch it onchain:",
      url: "https://buddies-onchain.xyz/hatch?accountUuid=abc",
    },
    {
      name: "unknown uses retry copy and hatch URL",
      buddyStatus: "unknown" as const,
      message: "unable to verify onchain status - try online:",
      url: "https://buddies-onchain.xyz/hatch?accountUuid=abc",
    },
  ];

  test.each(decisionCases)("$name", (cell) => {
    const payload = makeLookupPayload({
      buddyStatus: cell.buddyStatus,
    });

    expect(formatLookupBlock(payload)).toBe(
      [
        "BUDDY_RENDER_BEGIN",
        cell.message,
        cell.url,
        "",
        LITE_LINE,
        CHANGE_HINT,
        "BUDDY_RENDER_END",
      ].join("\n"),
    );
  });

  test("wraps cardLines in a fenced block before the decision message", () => {
    const payload = makeLookupPayload({
      buddyStatus: "warm",
      cardLines: ["> /buddy-onchain", "shiny RARE", "==="],
    });

    expect(formatLookupBlock(payload)).toBe(
      [
        "BUDDY_RENDER_BEGIN",
        "```",
        "> /buddy-onchain",
        "shiny RARE",
        "===",
        "```",
        "go see your buddy onchain:",
        "https://buddies-onchain.xyz/view/abc",
        "",
        LITE_LINE,
        CHANGE_HINT,
        "BUDDY_RENDER_END",
      ].join("\n"),
    );
  });

  test("cold-soft-fail statuses route to hatch URL, not view URL", () => {
    for (const buddyStatus of ["cold", "unknown"] as const) {
      const out = formatLookupBlock(makeLookupPayload({ buddyStatus }));

      expect(out).toContain("https://buddies-onchain.xyz/hatch?accountUuid=abc");
      expect(out).not.toContain("https://buddies-onchain.xyz/view/abc");
    }
  });

  test("skips OpenSea row when collection URL is null", () => {
    const out = formatLookupBlock(
      makeLookupPayload({
        buddyStatus: "warm",
        openseaCollectionUrl: null,
      }),
    );

    expect(out).not.toContain("see all hatched buddies:");
  });

  test("preserves alignment-sensitive cardLines verbatim (Codex finding 9)", () => {
    // Sprite art lives or dies by exact ASCII column alignment. Leading
    // spaces, trailing spaces, unicode separators, and stray backticks
    // must round-trip unchanged through `formatLookupBlock`.
    const ALIGNMENT_SENSITIVE_CARD_ROWS = [
      "    .[||].   ",
      "DBG 1 │ PAT 2",
      "     `-vvvv-´   ",
    ];
    const payload = makeLookupPayload({
      buddyStatus: "warm",
      cardLines: ALIGNMENT_SENSITIVE_CARD_ROWS,
    });
    const out = formatLookupBlock(payload);
    expect(out).toContain("\n    .[||].   \n");
    expect(out).toContain("\nDBG 1 │ PAT 2\n");
    expect(out).toContain("\n     `-vvvv-´   \n");
  });

  // `effectiveMode` renders; `persistedMode` only triggers the
  // env-override note when they diverge.
  describe("mode/cadence copy", () => {
    type ModeCell = {
      name: string;
      effective: ModeLevel;
      persisted: ModeLevel;
      expectedLines: string[];
    };

    const cells: ModeCell[] = [
      {
        name: "no env, persisted full → full copy, no note",
        effective: "full",
        persisted: "full",
        expectedLines: [FULL_LINE, CHANGE_HINT],
      },
      {
        name: "no env, persisted lite → lite copy, no note",
        effective: "lite",
        persisted: "lite",
        expectedLines: [LITE_LINE, CHANGE_HINT],
      },
      {
        name: "no env, persisted off → muted copy, no note",
        effective: "off",
        persisted: "off",
        expectedLines: [OFF_LINE, CHANGE_HINT],
      },
      {
        name: "env lite over persisted full → note + lite copy",
        effective: "lite",
        persisted: "full",
        expectedLines: [
          "note: `BUDDY_MODE=lite` overrides saved mode until unset",
          LITE_LINE,
          CHANGE_HINT,
        ],
      },
      {
        name: "env full over persisted lite → note + full copy",
        effective: "full",
        persisted: "lite",
        expectedLines: [
          "note: `BUDDY_MODE=full` overrides saved mode until unset",
          FULL_LINE,
          CHANGE_HINT,
        ],
      },
      {
        name: "env off over persisted full → note + muted copy",
        effective: "off",
        persisted: "full",
        expectedLines: [
          "note: `BUDDY_MODE=off` overrides saved mode until unset",
          OFF_LINE,
          CHANGE_HINT,
        ],
      },
      // Env-matches-persisted, invalid-env, and env-unset cases collapse into
      // the same `(effective, persisted)` pair from this formatter's view.
    ];

    test.each(cells)("$name", (cell) => {
      const payload = makeLookupPayload({
        buddyStatus: "cold",
        effectiveMode: cell.effective,
        persistedMode: cell.persisted,
      });

      const out = formatLookupBlock(payload);
      const expected = [
        "BUDDY_RENDER_BEGIN",
        "your buddy is sleeping - hatch it onchain:",
        "https://buddies-onchain.xyz/hatch?accountUuid=abc",
        "",
        ...cell.expectedLines,
        "BUDDY_RENDER_END",
      ].join("\n");
      expect(out).toBe(expected);
    });
  });
});

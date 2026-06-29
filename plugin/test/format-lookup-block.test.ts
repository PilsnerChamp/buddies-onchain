import { describe, test, expect } from "bun:test";
import { formatLookupBlock, type LookupPayload } from "../src/lookup-payload";
import type { ModeLevel } from "../src/buddy-state";
import { RENDER_VERBATIM_GUARD } from "../src/instructions";
import { CLAUDE_PROVIDER } from "~shared/providerBytes16";

const HATCH_URL =
  `https://buddies-onchain.xyz/hatch#identityHash=0x0fa54136bda4ecc31bcd4169c89d1ea7d5f294d7ef27022c1f68cfd5bab4ddbb&prngSeed=2990586173&provider=${CLAUDE_PROVIDER}`;

const TEST_CONTRACT = "0x000000000000000000000000000000000000b0dd";
const TEST_EXPLORER = "https://basescan.org/address/";
const TEST_CHAIN = "base";
const TEST_CHAIN_ID = 8453;

// Cold-only context facts (contract present). Mirrors `coldHatchFactLines`.
const COLD_FACTS = [
  "optional: unhatched, it still appears here sleeping; hatch to wake it, then re-run /buddy-onchain.",
  "plugin: read-only; never connects to your wallet or requests signatures.",
  "wallet: the tx should target the deployment below - decline token approvals, spending access, or unexpected ETH value.",
  "privacy: one-way identity hash + art seed onchain (pseudonymous, not anonymous); your raw account id stays local.",
];

// Always-on contract footer (contract + explorer present). Mirrors
// `deploymentFooterLines` — label on its own line, URL below.
const FOOTER = ["contract:", `${TEST_EXPLORER}${TEST_CONTRACT}`];

function makeLookupPayload(
  payload: Partial<LookupPayload> &
    Pick<LookupPayload, "buddyStatus">,
): LookupPayload {
  return {
    cardLines: [],
    viewUrl: "https://buddies-onchain.xyz/view/123",
    hatchUrl: HATCH_URL,
    openseaItemUrl: null,
    contractAddress: TEST_CONTRACT,
    explorerAddressBase: TEST_EXPLORER,
    chainDisplayName: TEST_CHAIN,
    chainId: TEST_CHAIN_ID,
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
      url: "https://buddies-onchain.xyz/view/123",
    },
    {
      name: "cold uses hatch copy and hatch URL",
      buddyStatus: "cold" as const,
      message: "your buddy is sleeping - not yet hatched onchain:",
      url: HATCH_URL,
    },
    {
      name: "unknown uses retry copy and hatch URL",
      buddyStatus: "unknown" as const,
      message: "couldn't verify onchain status - check on the site:",
      url: HATCH_URL,
    },
  ];

  test("renders the context-only guard only when requested", () => {
    const payload = makeLookupPayload({ buddyStatus: "warm" });

    const defaultOut = formatLookupBlock(payload);
    const explicitFalseOut = formatLookupBlock(payload, false);
    const guardedOut = formatLookupBlock(payload, true);

    expect(defaultOut).not.toContain(RENDER_VERBATIM_GUARD);
    expect(explicitFalseOut).not.toContain(RENDER_VERBATIM_GUARD);
    expect(defaultOut.split("\n")[0]).toBe("BUDDY_RENDER_BEGIN");
    expect(explicitFalseOut.split("\n")[0]).toBe("BUDDY_RENDER_BEGIN");
    expect(guardedOut.split("\n").slice(0, 2)).toEqual([
      RENDER_VERBATIM_GUARD,
      "BUDDY_RENDER_BEGIN",
    ]);
  });

  test.each(decisionCases)("$name", (cell) => {
    const payload = makeLookupPayload({
      buddyStatus: cell.buddyStatus,
    });

    expect(formatLookupBlock(payload)).toBe(
      [
        "BUDDY_RENDER_BEGIN",
        cell.message,
        cell.url,
        // Cold gets a blank-separated facts paragraph; warm/unknown run the
        // contract line straight on from the body — no interior blank.
        ...(cell.buddyStatus === "cold" ? ["", ...COLD_FACTS] : []),
        ...FOOTER,
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
        "",
        "go see your buddy onchain:",
        "https://buddies-onchain.xyz/view/123",
        ...FOOTER,
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

      expect(out).toContain(HATCH_URL);
      expect(out).not.toContain("https://buddies-onchain.xyz/view/123");
    }
  });

  test("cold degrades when contract address is unknown (pre-deploy)", () => {
    const out = formatLookupBlock(
      makeLookupPayload({
        buddyStatus: "cold",
        contractAddress: null,
        explorerAddressBase: null,
        chainDisplayName: "base",
      }),
    );

    expect(out).toBe(
      [
        "BUDDY_RENDER_BEGIN",
        "your buddy is sleeping - not yet hatched onchain:",
        "",
        "optional: unhatched, it still appears here sleeping.",
        "plugin: read-only; never connects to your wallet or requests signatures.",
        `deployment: base (${TEST_CHAIN_ID}) - no contract configured for this network`,
        "",
        LITE_LINE,
        CHANGE_HINT,
        "BUDDY_RENDER_END",
      ].join("\n"),
    );
    // Pre-deploy: no hatch URL, no verify link, no privacy/wake guidance that
    // implies a reachable mint.
    expect(out).not.toContain(HATCH_URL);
    expect(out).not.toContain("verify:");
    expect(out).not.toContain("hatch to wake it");
  });

  test("skips the OpenSea row when the item URL is null", () => {
    const out = formatLookupBlock(
      makeLookupPayload({
        buddyStatus: "warm",
        openseaItemUrl: null,
      }),
    );

    expect(out).not.toContain("opensea:");
  });

  test("warm renders the per-item OpenSea link on its own line below the view URL", () => {
    const ITEM_URL =
      "https://opensea.io/item/base/0x000000000000000000000000000000000000b0dd/1";
    const out = formatLookupBlock(
      makeLookupPayload({
        buddyStatus: "warm",
        openseaItemUrl: ITEM_URL,
      }),
    );

    // Warm renders one contiguous block — view, opensea, contract — no blank
    // lines between the labelled links.
    expect(out).toContain(
      [
        "go see your buddy onchain:",
        "https://buddies-onchain.xyz/view/123",
        "opensea:",
        ITEM_URL,
        ...FOOTER,
      ].join("\n"),
    );
  });

  test("preserves alignment-sensitive cardLines verbatim", () => {
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
        "your buddy is sleeping - not yet hatched onchain:",
        HATCH_URL,
        "",
        ...COLD_FACTS,
        ...FOOTER,
        "",
        ...cell.expectedLines,
        "BUDDY_RENDER_END",
      ].join("\n");
      expect(out).toBe(expected);
    });
  });
});

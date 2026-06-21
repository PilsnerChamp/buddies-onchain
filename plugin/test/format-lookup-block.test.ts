import { describe, test, expect } from "bun:test";
import { formatLookupBlock, type LookupPayload } from "../src/lookup-payload";
import type { ModeLevel } from "../src/buddy-state";
import { CLAUDE_PROVIDER } from "~shared/providerBytes16";

const HATCH_URL =
  `https://buddies-onchain.xyz/hatch#identityHash=0x0fa54136bda4ecc31bcd4169c89d1ea7d5f294d7ef27022c1f68cfd5bab4ddbb&prngSeed=2990586173&provider=${CLAUDE_PROVIDER}`;

const TEST_CONTRACT = "0x000000000000000000000000000000000000b0dd";
const TEST_EXPLORER = "https://basescan.org/address/";
const TEST_CHAIN = "base";

// Expected cold-hatch disclosure lines for the default (contract + explorer
// present) payload. Mirrors `coldHatchDisclosureLines` in lookup-payload.ts.
const COLD_DISCLOSURE = [
  "hatching is optional - your buddy works unhatched. this plugin is read-only and never connects to your wallet or requests signatures.",
  `to hatch you open the link, connect a wallet, and sign one ${TEST_CHAIN} transaction (gas only - nothing to the plugin):`,
  `  contract ${TEST_CONTRACT} · function hatch · value 0 ETH · no token approvals`,
  "  if the transaction preview shows a different contract, nonzero ETH value, token approval, or spending access, cancel.",
  "on-chain it writes a one-way identity hash + seed - a stable pseudonymous marker, not anonymous. your raw account id never leaves your machine.",
  `verify the contract: ${TEST_EXPLORER}${TEST_CONTRACT}`,
];

function makeLookupPayload(
  payload: Partial<LookupPayload> &
    Pick<LookupPayload, "buddyStatus">,
): LookupPayload {
  return {
    cardLines: [],
    viewUrl: "https://buddies-onchain.xyz/view/123",
    hatchUrl: HATCH_URL,
    openseaCollectionUrl: null,
    contractAddress: TEST_CONTRACT,
    explorerAddressBase: TEST_EXPLORER,
    chainDisplayName: TEST_CHAIN,
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
  const COLD_NOTE =
    "after hatching, re-run `/buddy-onchain` or restart the session to see it wake.";

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
      message: "unable to verify onchain status - try online:",
      url: HATCH_URL,
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
        ...(cell.buddyStatus === "cold" ? COLD_DISCLOSURE : []),
        cell.url,
        ...(cell.buddyStatus === "cold" ? [COLD_NOTE] : []),
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

  test("cold disclosure degrades when contract address is unknown (pre-deploy)", () => {
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
        "hatching is optional - your buddy works unhatched. this plugin is read-only and never connects to your wallet or requests signatures.",
        "hatch contract is not configured for this network - hatch unavailable from this build.",
        "on-chain it writes a one-way identity hash + seed - a stable pseudonymous marker, not anonymous. your raw account id never leaves your machine.",
        "",
        LITE_LINE,
        CHANGE_HINT,
        "BUDDY_RENDER_END",
      ].join("\n"),
    );
    // Pre-deploy: warn, never coach a signature. No fingerprint, no verify
    // link, no signing invitation, no hatch URL, no post-hatch rerun line.
    expect(out).not.toContain("function hatch");
    expect(out).not.toContain("verify the contract:");
    expect(out).not.toContain("connect a wallet");
    expect(out).not.toContain(HATCH_URL);
    expect(out).not.toContain(COLD_NOTE);
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
        ...COLD_DISCLOSURE,
        HATCH_URL,
        COLD_NOTE,
        "",
        ...cell.expectedLines,
        "BUDDY_RENDER_END",
      ].join("\n");
      expect(out).toBe(expected);
    });
  });
});

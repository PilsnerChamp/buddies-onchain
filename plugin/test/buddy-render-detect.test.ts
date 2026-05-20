import { describe, expect, test } from "bun:test";
import { detectBuddyRender } from "../src/buddy-render-detect";

function block(rows: string[], fence = "```"): string {
  return [fence, ...rows, fence].join("\n");
}

describe("detectBuddyRender", () => {
  test("top untagged fence with 4 rows containing spaced pipe separators returns true", () => {
    expect(detectBuddyRender(block([
      "  .[||].  | self owns",
      " [ x  x ] | barely useful",
      " [ ==== ] | chain goblin",
      " `------´ |",
    ]))).toBe(true);
  });

  test("untagged fence after 1 preamble line returns true", () => {
    expect(detectBuddyRender([
      "tiny preamble",
      block([
        "row one | joke",
        "row two | joke",
        "row three | joke",
      ]),
    ].join("\n"))).toBe(true);
  });

  test("untagged fence after 2 preamble lines returns true", () => {
    expect(detectBuddyRender([
      "preamble one",
      "preamble two",
      block([
        "row one | joke",
        "row two | joke",
        "row three | joke",
      ]),
    ].join("\n"))).toBe(true);
  });

  test("untagged fence after 3 preamble lines returns false", () => {
    expect(detectBuddyRender([
      "preamble one",
      "preamble two",
      "preamble three",
      block([
        "row one | joke",
        "row two | joke",
        "row three | joke",
      ]),
    ].join("\n"))).toBe(false);
  });

  test("bash-tagged fence at top returns false", () => {
    expect(detectBuddyRender([
      "```bash",
      "row one | joke",
      "row two | joke",
      "row three | joke",
      "```",
    ].join("\n"))).toBe(false);
  });

  test("text-tagged fence at top returns true", () => {
    expect(detectBuddyRender([
      "```text",
      "row one | joke",
      "row two | joke",
      "row three | joke",
      "```",
    ].join("\n"))).toBe(true);
  });

  test("txt-tagged fence at top returns true", () => {
    expect(detectBuddyRender([
      "```txt",
      "row one | joke",
      "row two | joke",
      "row three | joke",
      "```",
    ].join("\n"))).toBe(true);
  });

  test("markdown table separator row rejects the whole block", () => {
    expect(detectBuddyRender(block([
      "name | desc",
      "|---|---|",
      "buddy | oops",
      "chain | gremlin",
    ]))).toBe(false);
  });

  test("empty assistant text returns false", () => {
    expect(detectBuddyRender("")).toBe(false);
  });

  test("mutated buddy with x eyes and dropped trailing row returns true", () => {
    expect(detectBuddyRender(block([
      "  .[||].  | hat forgot",
      " [ x  x ] | eyes downgraded",
      " [ ==== ] | still compiling",
    ]))).toBe(true);
  });

  test("spaceless pipe rows return true", () => {
    expect(detectBuddyRender(block([
      "a|b",
      "c|d",
      "e|f",
    ]))).toBe(true);
  });

  test("8-row untagged fence with at least 5 pipe rows returns true", () => {
    expect(detectBuddyRender(block([
      "one | joke",
      "two | joke",
      "three | joke",
      "four | joke",
      "five | joke",
      "six no pipe",
      "seven no pipe",
      "eight no pipe",
    ]))).toBe(true);
  });

  test("9-row untagged fence returns false", () => {
    expect(detectBuddyRender(block([
      "one | joke",
      "two | joke",
      "three | joke",
      "four | joke",
      "five | joke",
      "six | joke",
      "seven | joke",
      "eight | joke",
      "nine | joke",
    ]))).toBe(false);
  });

  test("2-row untagged fence returns false", () => {
    expect(detectBuddyRender(block([
      "one | joke",
      "two | joke",
    ]))).toBe(false);
  });

  test("top comparison table without separator returns true as accepted false positive", () => {
    expect(detectBuddyRender(block([
      "name | desc",
      "alpha | first",
      "beta | second",
      "gamma | third",
    ]))).toBe(true);
  });

  test("slash sentinels in plain text return false", () => {
    expect(detectBuddyRender([
      "BUDDY_RENDER_BEGIN",
      "go see your buddy onchain:",
      "https://buddies-onchain.xyz/view/abc",
      "BUDDY_RENDER_END",
    ].join("\n"))).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { resolveBuddyStatusMessage } from "../src/buddy-status-message";

describe("resolveBuddyStatusMessage", () => {
  test("warm returns view copy", () => {
    expect(
      resolveBuddyStatusMessage({
        buddyStatus: "warm",
      }),
    ).toEqual({
      message: "go see your buddy onchain:",
      urlTarget: "view",
    });
  });

  test("cold returns hatch copy", () => {
    expect(
      resolveBuddyStatusMessage({
        buddyStatus: "cold",
      }),
    ).toEqual({
      message: "your buddy is sleeping - hatch it onchain:",
      urlTarget: "hatch",
    });
  });

  test("unknown returns retry hatch copy", () => {
    expect(
      resolveBuddyStatusMessage({
        buddyStatus: "unknown",
      }),
    ).toEqual({
      message: "unable to verify onchain status - try online:",
      urlTarget: "hatch",
    });
  });
});

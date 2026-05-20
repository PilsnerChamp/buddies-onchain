/**
 * Tests for the merged `/buddy-onchain` UserPromptSubmit router.
 */

import { describe, expect, test } from "bun:test";
import { routePrompt } from "../src/command-router";

describe("routePrompt — lookup", () => {
  test("bare /buddy-onchain routes to lookup", () => {
    expect(routePrompt("/buddy-onchain")).toEqual({ kind: "lookup" });
  });

  test("legacy namespaced form routes to lookup", () => {
    expect(routePrompt("/buddy-onchain:buddy-onchain")).toEqual({
      kind: "lookup",
    });
  });

  test("leading and trailing whitespace are ignored", () => {
    expect(routePrompt("  /buddy-onchain   ")).toEqual({ kind: "lookup" });
  });
});

describe("routePrompt — mutate", () => {
  test.each(["off", "lite", "full"] as const)(
    "/buddy-onchain %s routes to mutate",
    (verb) => {
      expect(routePrompt(`/buddy-onchain ${verb}`)).toEqual({
        kind: "mutate",
        verb,
      });
    },
  );

  test("verb is case-insensitive", () => {
    expect(routePrompt("/buddy-onchain OFF")).toEqual({
      kind: "mutate",
      verb: "off",
    });
    expect(routePrompt("/buddy-onchain Lite")).toEqual({
      kind: "mutate",
      verb: "lite",
    });
    expect(routePrompt("/buddy-onchain FULL")).toEqual({
      kind: "mutate",
      verb: "full",
    });
  });

  test("trailing tokens after the verb are ignored", () => {
    expect(routePrompt("/buddy-onchain full please now")).toEqual({
      kind: "mutate",
      verb: "full",
    });
  });
});

describe("routePrompt — invalid", () => {
  test("unknown verb routes to invalid with original token", () => {
    expect(routePrompt("/buddy-onchain ultra")).toEqual({
      kind: "invalid",
      verb: "ultra",
    });
  });

  test("only the first arg token matters", () => {
    expect(routePrompt("/buddy-onchain garbage full")).toEqual({
      kind: "invalid",
      verb: "garbage",
    });
  });
});

describe("routePrompt — ambient", () => {
  test.each([
    "",
    "   ",
    "hello buddy",
    "please run /buddy-onchain",
    "/buddy-" + "mode",
    "/buddy-onchain-extra",
    "/BUDDY-ONCHAIN",
  ])("%s routes to ambient", (prompt) => {
    expect(routePrompt(prompt)).toEqual({ kind: "ambient" });
  });

  test("nullish prompts route to ambient", () => {
    expect(routePrompt(undefined)).toEqual({ kind: "ambient" });
    expect(routePrompt(null)).toEqual({ kind: "ambient" });
  });
});

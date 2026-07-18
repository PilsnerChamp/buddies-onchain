// SessionStart warm art-cache recovery (`ensureWarmArtCache`).
//
// The helper is the heal path for a warm buddy whose ambient art cache was
// cleared (identity rotation) or never written: one bounded tokenURI fetch,
// soft-fail on everything. These tests pin the guard conditions — no RPC
// when the cache already matches, no RPC for cold/pre-deploy states, and a
// hung RPC bounded by the race timeout instead of stalling session boot.

import { afterEach, describe, expect, test } from "bun:test";

import { readArtCache } from "../src/art-cache";
import { defaultState, type BuddyStateV4, type IdentityTuple } from "../src/buddy-state";
import { ensureWarmArtCache } from "../src/lookup-payload";
import { createScopedReadClient, setPublicClientForTest } from "../src/publicClient";
import {
  MOCK_DEPLOYED_NET,
  cleanupLookupFixtureEnv,
  fakeReadContractClient,
  installTempClaudeConfigRoot,
} from "./_helpers/lookup-fixtures";

const IDENTITY: IdentityTuple = {
  accountUuidHash: "c".repeat(64),
  chainId: MOCK_DEPLOYED_NET.chainId,
  contractAddress: MOCK_DEPLOYED_NET.buddyNft!.toLowerCase(),
};

const PRE_DEPLOY_IDENTITY: IdentityTuple = {
  ...IDENTITY,
  contractAddress: null,
};

function warmState(tokenId: string | null = "0x2a"): BuddyStateV4 {
  return {
    ...defaultState(),
    ...IDENTITY,
    hatch: "warm",
    tokenId,
  };
}

function makeTokenUri(): string {
  const frame = (id: string, rows: string[]) =>
    [
      `<g id="${id}">`,
      ...rows.map((row) => `<text class="sprite">${row}</text>`),
      "</g>",
    ].join("");

  const svg = [
    "<svg>",
    frame("f0", ["  .[||].", " [ -  - ]", " [ ==== ]"]),
    frame("fb", ["  .[||].", " [ ×  × ]", " [ ==== ]"]),
    "</svg>",
  ].join("");
  const svgB64 = Buffer.from(svg, "utf8").toString("base64");
  const jsonB64 = Buffer.from(
    JSON.stringify({ image: `data:image/svg+xml;base64,${svgB64}` }),
  ).toString("base64");

  return `data:application/json;base64,${jsonB64}`;
}

function tokenUriClient(counter: { calls: number }) {
  return fakeReadContractClient(async () => {
    counter.calls += 1;
    return makeTokenUri();
  });
}

afterEach(() => {
  cleanupLookupFixtureEnv();
});

describe("ensureWarmArtCache", () => {
  test("warm + missing cache rebuilds frames from one tokenURI fetch", async () => {
    installTempClaudeConfigRoot();
    const counter = { calls: 0 };
    setPublicClientForTest(tokenUriClient(counter));

    await ensureWarmArtCache({
      state: warmState(),
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(counter.calls).toBe(1);
    expect(readArtCache()).toMatchObject({
      schemaVersion: 1,
      accountUuidHash: IDENTITY.accountUuidHash,
      chainId: IDENTITY.chainId,
      contractAddress: IDENTITY.contractAddress,
      tokenId: "0x2a",
      frames: {
        f0: ["  .[||].", " [ -  - ]", " [ ==== ]"],
        fb: ["  .[||].", " [ ×  × ]", " [ ==== ]"],
      },
    });
  });

  test("matching cache skips the fetch entirely", async () => {
    installTempClaudeConfigRoot();
    const counter = { calls: 0 };
    setPublicClientForTest(tokenUriClient(counter));

    await ensureWarmArtCache({
      state: warmState(),
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });
    const seeded = readArtCache();
    expect(counter.calls).toBe(1);

    await ensureWarmArtCache({
      state: warmState(),
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(counter.calls).toBe(1);
    expect(readArtCache()).toEqual(seeded!);
  });

  test("token-mismatched cache is rebuilt for the current token", async () => {
    installTempClaudeConfigRoot();
    const counter = { calls: 0 };
    setPublicClientForTest(tokenUriClient(counter));

    await ensureWarmArtCache({
      state: warmState(),
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });
    expect(counter.calls).toBe(1);

    await ensureWarmArtCache({
      state: warmState("0x2b"),
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(counter.calls).toBe(2);
    expect(readArtCache()).toMatchObject({ tokenId: "0x2b" });
  });

  test.each([
    ["cold hatch", { ...warmState(), hatch: "cold" as const, tokenId: null }],
    ["warm without tokenId", warmState(null)],
  ])("%s performs no RPC and writes nothing", async (_name, state) => {
    installTempClaudeConfigRoot();
    const counter = { calls: 0 };
    setPublicClientForTest(tokenUriClient(counter));

    await ensureWarmArtCache({
      state,
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(counter.calls).toBe(0);
    expect(readArtCache()).toBeNull();
  });

  test("pre-deploy identity (null contract) performs no RPC", async () => {
    installTempClaudeConfigRoot();
    const counter = { calls: 0 };
    setPublicClientForTest(tokenUriClient(counter));

    await ensureWarmArtCache({
      state: warmState(),
      identity: PRE_DEPLOY_IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(counter.calls).toBe(0);
    expect(readArtCache()).toBeNull();
  });

  test("RPC failure resolves without throwing and writes nothing", async () => {
    installTempClaudeConfigRoot();
    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unavailable");
      }),
    );

    await ensureWarmArtCache({
      state: warmState(),
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(readArtCache()).toBeNull();
  });

  test("test-seam client wins over the scoped abortable client", () => {
    const fake = fakeReadContractClient(async () => makeTokenUri());
    setPublicClientForTest(fake);

    const scoped = createScopedReadClient(new AbortController().signal);

    expect(scoped).toBe(fake);
  });

  test("fast success clears both timers (no stray handles)", async () => {
    installTempClaudeConfigRoot();
    setPublicClientForTest(tokenUriClient({ calls: 0 }));

    const created: unknown[] = [];
    const cleared = new Set<unknown>();
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const timer = realSetTimeout(fn, ms);
      created.push(timer);
      return timer;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((timer: unknown) => {
      cleared.add(timer);
      return realClearTimeout(timer as Parameters<typeof clearTimeout>[0]);
    }) as typeof clearTimeout;

    try {
      await ensureWarmArtCache({
        state: warmState(),
        identity: IDENTITY,
        netOverride: MOCK_DEPLOYED_NET,
      });
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }

    expect(created.length).toBe(2);
    for (const timer of created) {
      expect(cleared.has(timer)).toBe(true);
    }
    expect(readArtCache()).not.toBeNull();
  });

  test("hung RPC is bounded by the race timeout", async () => {
    installTempClaudeConfigRoot();
    setPublicClientForTest(
      fakeReadContractClient(() => new Promise(() => {})),
    );

    const startedAt = Date.now();
    await ensureWarmArtCache({
      state: warmState(),
      identity: IDENTITY,
      netOverride: MOCK_DEPLOYED_NET,
      timeoutMs: 50,
    });

    expect(Date.now() - startedAt).toBeLessThan(1500);
    expect(readArtCache()).toBeNull();
  });
});

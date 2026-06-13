import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, test, expect } from "bun:test";
import { resolveLookupPayload, type LookupPayload } from "../src/lookup-payload";
import { SLEEP_INDICATOR_ROW } from "../src/sprite-decorations";
import {
  readState,
  type BuddyStateV4,
} from "../src/buddy-state";
import { setPublicClientForTest } from "../src/publicClient";
import type { PluginNetworkInfo } from "../src/network";
import {
  FIXTURE_ACCOUNT_UUID,
  LOCAL_BUDDY_NFT_ADDRESS,
  MOCK_DEPLOYED_NET,
  SEPOLIA_DEPLOYED_NET,
  cleanupLookupFixtureEnv,
  expectStateIdentity,
  fakeReadContractClient,
  fakeReadContractClientByFunction,
  installTempClaudeConfigRoot,
  readIdentityTuple,
  seedBuddyState,
} from "./_helpers/lookup-fixtures";
import { CLAUDE_PROVIDER } from "~shared/providerBytes16";

const EXPECTED_SLEEPING_CARD_ROWS = [
  "",
  "      .[||].",
  "     [ -  - ]",
  "     [ ==== ]",
  "     `------´",
];
const EXPECTED_COLD_SLEEPING_CARD_ROWS = [
  SLEEP_INDICATOR_ROW,
  ...EXPECTED_SLEEPING_CARD_ROWS.slice(1),
];
const EXPECTED_CACHED_F0_ROWS = [
  "cached f0 row 1",
  "cached f0 row 2",
];
const EXPECTED_HATCH_FRAGMENT =
  `identityHash=0x0fa54136bda4ecc31bcd4169c89d1ea7d5f294d7ef27022c1f68cfd5bab4ddbb&prngSeed=2990586173&provider=${CLAUDE_PROVIDER}`;
const PROD_HATCH_URL = `https://buddies-onchain.xyz/hatch#${EXPECTED_HATCH_FRAGMENT}`;
const LOCAL_HATCH_URL = `http://localhost:5173/hatch#${EXPECTED_HATCH_FRAGMENT}`;
const PLUGIN_ROOT = join(import.meta.dir, "..");
let claudeConfigRoot: string | null = null;

beforeEach(() => {
  claudeConfigRoot = installTempClaudeConfigRoot();
});

afterEach(() => {
  claudeConfigRoot = null;
  cleanupLookupFixtureEnv();
});

describe("resolveLookupPayload — uuid validation", () => {
  test("returns null on malformed UUID override", async () => {
    expect(
      await resolveLookupPayload({ accountUuidOverride: "not-a-uuid" }),
    ).toBeNull();
  });

  test("returns null on empty UUID override", async () => {
    expect(
      await resolveLookupPayload({ accountUuidOverride: "" }),
    ).toBeNull();
  });
});

// Minimal valid tokenURI fixture: JSON image data URI wrapping SVG frames in
// the shape `extractCardLines` expects.
function makeCardTokenUri(): string {
  const frame = (id: string, rows: string[]) => [
    `<g id="${id}">`,
    ...rows.map((row) => `<text class="sprite">${row}</text>`),
    "</g>",
  ].join("");

  const svg = [
    "<svg>",
    "<text class=\"stat\">&gt; /buddy-onchain</text>",
    "<text class=\"stat\">shiny RARE</text>",
    "<text class=\"stat\">==============</text>",
    frame("f0", ["  .[||].", " [ -  - ]", " [ ==== ]"]),
    frame("f1", ["  .[||].", " [ o  - ]", " [ ==== ]"]),
    frame("f2", ["  .[||].", " [ -  o ]", " [ ==== ]"]),
    frame("fb", ["  .[||].", " [ ×  × ]", " [ ==== ]"]),
    "<text class=\"stat\">==============</text>",
    "<text class=\"stat\">HP 42 / ATK 17</text>",
    "</svg>",
  ].join("");
  const svgB64 = Buffer.from(svg, "utf8").toString("base64");
  const json = JSON.stringify({
    image: `data:image/svg+xml;base64,${svgB64}`,
  });
  const jsonB64 = Buffer.from(json, "utf8").toString("base64");
  return `data:application/json;base64,${jsonB64}`;
}

async function runWarmStalePayloadSubprocess(
  root: string,
  seedCache: boolean,
): Promise<{
  result: LookupPayload | null;
  getTokenCalls: number;
  tokenUriCalls: number;
}> {
  // Subprocess needed because ACTIVE_NETWORK is per-process and identity match
  // requires BUDDY_NETWORK=local.
  const accountUuidHash = createHash("sha256")
    .update(FIXTURE_ACCOUNT_UUID)
    .digest("hex");
  const stateDir = join(root, "plugins", "buddy-onchain");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(stateDir, ".buddy-state"),
    JSON.stringify({
      schemaVersion: 4,
      mode: "lite",
      hatch: "warm",
      tokenId: "0xfeed",
      accountUuidHash,
      chainId: 31337,
      contractAddress: LOCAL_BUDDY_NFT_ADDRESS,
      turnCounter: 0,
      coldNudgeCounter: 0,
    }),
  );
  if (seedCache) {
    writeFileSync(
      join(stateDir, ".buddy-art-cache.json"),
      JSON.stringify({
        schemaVersion: 1,
        accountUuidHash,
        chainId: 31337,
        contractAddress: LOCAL_BUDDY_NFT_ADDRESS,
        tokenId: "0xfeed",
        frames: {
          f0: EXPECTED_CACHED_F0_ROWS,
          f1: ["  .[||].", " [ o  - ]", " [ ==== ]"],
          f2: ["  .[||].", " [ -  o ]", " [ ==== ]"],
          fb: ["  .[||].", " [ ×  × ]", " [ ==== ]"],
        },
        cachedAtMs: 200,
      }),
    );
  }

  const script = `
    import { setPublicClientForTest } from "./src/publicClient.ts";
    import { resolveLookupPayload } from "./src/lookup-payload.ts";

    let getTokenCalls = 0;
    let tokenUriCalls = 0;
    setPublicClientForTest({
      readContract: async (call) => {
        if (call.functionName === "getTokenIdByIdentity") {
          getTokenCalls++;
          throw new Error("rpc unavailable");
        }
        if (call.functionName === "tokenURI") {
          tokenUriCalls++;
          throw new Error("tokenURI should not be called while offline");
        }
        throw new Error("unexpected readContract call");
      },
    });

    const result = await resolveLookupPayload({});
    console.log(JSON.stringify({ result, getTokenCalls, tokenUriCalls }));
  `;

  const proc = Bun.spawn(["bun", "--eval", script], {
    cwd: PLUGIN_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: root,
      CLAUDE_CONFIG_DIR: root,
      BUDDY_NETWORK: "local",
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  expect(proc.exitCode).toBe(0);
  expect(stderr).toBe("");

  return JSON.parse(stdout) as {
    result: LookupPayload | null;
    getTokenCalls: number;
    tokenUriCalls: number;
  };
}

async function runWarmLookupArtCacheSubprocess(root: string): Promise<{
  result: LookupPayload | null;
  cache: unknown;
  getTokenCalls: number;
  tokenUriCalls: number;
}> {
  const tokenUri = JSON.stringify(makeCardTokenUri());
  const script = `
    import { setPublicClientForTest } from "./src/publicClient.ts";
    import { resolveLookupPayload } from "./src/lookup-payload.ts";
    import { readArtCache } from "./src/art-cache.ts";

    const tokenUri = ${tokenUri};
    let getTokenCalls = 0;
    let tokenUriCalls = 0;
    setPublicClientForTest({
      readContract: async (call) => {
        if (call.functionName === "getTokenIdByIdentity") {
          getTokenCalls++;
          return 42n;
        }
        if (call.functionName === "tokenURI") {
          tokenUriCalls++;
          return tokenUri;
        }
        throw new Error("unexpected readContract call");
      },
    });

    const result = await resolveLookupPayload({});
    const cache = readArtCache();
    console.log(JSON.stringify({ result, cache, getTokenCalls, tokenUriCalls }));
  `;

  const proc = Bun.spawn(["bun", "--eval", script], {
    cwd: PLUGIN_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: root,
      CLAUDE_CONFIG_DIR: root,
      BUDDY_NETWORK: "local",
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;

  expect(proc.exitCode).toBe(0);
  expect(stderr).toBe("");

  return JSON.parse(stdout) as {
    result: LookupPayload | null;
    cache: unknown;
    getTokenCalls: number;
    tokenUriCalls: number;
  };
}

describe("resolveLookupPayload — status mapping", () => {
  test("warm-hatched populates cardLines from on-chain tokenURI", async () => {
    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 42n,
        tokenURI: async () => makeCardTokenUri(),
      }),
    );
    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: MOCK_DEPLOYED_NET,
    });
    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("warm");
    // Card pipeline drops command chrome, decodes entities, strips trailing spaces.
    expect(result!.cardLines).toEqual([
      "shiny RARE",
      "==============",
      "  .[||].",
      " [ -  - ]",
      " [ ==== ]",
      "==============",
      "HP 42 / ATK 17",
    ]);
  });

  test("warm-hatched with sprite-fetch failure returns sleeping fallback", async () => {
    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 42n,
        tokenURI: async () => {
          throw new Error("sprite RPC down");
        },
      }),
    );
    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: MOCK_DEPLOYED_NET,
    });
    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("warm");
    expect(result!.cardLines).toEqual(EXPECTED_SLEEPING_CARD_ROWS);
  });

  test("cold-miss maps to cold + online", async () => {
    setPublicClientForTest(fakeReadContractClient(async () => 0n));
    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: MOCK_DEPLOYED_NET,
    });
    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("cold");
    expect(result!.cardLines).toEqual(EXPECTED_COLD_SLEEPING_CARD_ROWS);
  });

  test("RPC throw without cache maps to unknown + offline", async () => {
    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unreachable");
      }),
    );
    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: MOCK_DEPLOYED_NET,
    });
    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("unknown");
    expect(result!.cardLines).toEqual(EXPECTED_SLEEPING_CARD_ROWS);
  });

  test("pre-deploy chain (buddyNft null) maps to unknown + offline", async () => {
    const preDeploySepoliaNet: PluginNetworkInfo = {
      ...SEPOLIA_DEPLOYED_NET,
      buddyNft: null,
      deploymentBlock: null,
    };
    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: preDeploySepoliaNet,
    });
    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("unknown");
    expect(result!.cardLines).toEqual(EXPECTED_SLEEPING_CARD_ROWS);
  });

  test("URLs are absolute — sepolia routes to prod origin", async () => {
    setPublicClientForTest(fakeReadContractClient(async () => 0n));
    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: SEPOLIA_DEPLOYED_NET,
    });
    expect(result!.hatchUrl).toBe(PROD_HATCH_URL);
    expect(result!.viewUrl).toBe("https://buddies-onchain.xyz/view");
    expect(result!.hatchUrl).not.toContain(FIXTURE_ACCOUNT_UUID);
    expect(result!.hatchUrl).not.toContain("accountUuid");
    expect(result!.hatchUrl).toMatch(
      /^https:\/\/buddies-onchain\.xyz\/hatch#identityHash=0x[0-9a-f]{64}&prngSeed=\d+&provider=claude$/,
    );
  });

  test("RPC throw with cached warm maps to warm + offline with view URL", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });

    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unreachable");
      }),
    );

    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: MOCK_DEPLOYED_NET,
    });
    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("warm");
    expect(result!.viewUrl).toBe("https://buddies-onchain.xyz/view/65261");
    expect(result!.viewUrl).not.toContain("/hatch");
    expect(result!.cardLines).toEqual(EXPECTED_SLEEPING_CARD_ROWS);
  });

  test("RPC throw without cached warm stays unknown + offline", async () => {
    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unreachable");
      }),
    );
    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: MOCK_DEPLOYED_NET,
    });
    expect(result!.buddyStatus).toBe("unknown");
    expect(result!.cardLines).toEqual(EXPECTED_SLEEPING_CARD_ROWS);
  });

  test("pre-deploy chain with cached warm maps to warm + offline", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });

    const preDeploySepoliaNet: PluginNetworkInfo = {
      ...SEPOLIA_DEPLOYED_NET,
      buddyNft: null,
      deploymentBlock: null,
    };

    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: preDeploySepoliaNet,
    });
    expect(result!.buddyStatus).toBe("warm");
    expect(result!.cardLines).toEqual(EXPECTED_SLEEPING_CARD_ROWS);
  });
});

describe("resolveLookupPayload — orchestrator integration", () => {
  test("warm orchestrator path returns render shape and writes state", async () => {
    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 42n,
        tokenURI: async () => makeCardTokenUri(),
      }),
    );

    const result = await resolveLookupPayload({
      accountUuidOverride: FIXTURE_ACCOUNT_UUID,
      netOverride: MOCK_DEPLOYED_NET,
    });
    const state = readState();

    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("warm");
    expect(result!.cardLines.length).toBeGreaterThan(0);
    expect(result!.viewUrl).toContain("/view/42");
    expect(result!.hatchUrl).toBe(PROD_HATCH_URL);
    expect(state).not.toBeNull();
    expect(state!.hatch).toBe("warm");
    expect(state!.tokenId).toBe("0x2a");
  });

  test("warm offline keeps view URL and uses cached f0 without tokenURI", async () => {
    const root = claudeConfigRoot;
    if (root === null) {
      throw new Error("test claude root not initialized");
    }
    const { result, getTokenCalls, tokenUriCalls } =
      await runWarmStalePayloadSubprocess(root, true);

    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("warm");
    expect(result!.viewUrl).toBe("http://localhost:5173/view/65261");
    expect(result!.hatchUrl).toBe(LOCAL_HATCH_URL);
    expect(result!.cardLines).toEqual(EXPECTED_CACHED_F0_ROWS);
    expect(getTokenCalls).toBe(1);
    expect(tokenUriCalls).toBe(0);
  });

  test("warm offline cache miss falls back to sleeping frame without tokenURI", async () => {
    const root = claudeConfigRoot;
    if (root === null) {
      throw new Error("test claude root not initialized");
    }
    const { result, getTokenCalls, tokenUriCalls } =
      await runWarmStalePayloadSubprocess(root, false);

    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("warm");
    expect(result!.cardLines).toEqual(EXPECTED_SLEEPING_CARD_ROWS);
    expect(getTokenCalls).toBe(1);
    expect(tokenUriCalls).toBe(0);
  });

  test("warm chain read populates the ambient art cache", async () => {
    const root = claudeConfigRoot;
    if (root === null) {
      throw new Error("test claude root not initialized");
    }

    const { result, cache, getTokenCalls, tokenUriCalls } =
      await runWarmLookupArtCacheSubprocess(root);

    expect(result).not.toBeNull();
    expect(result!.buddyStatus).toBe("warm");
    expect(getTokenCalls).toBe(1);
    expect(tokenUriCalls).toBe(1);
    expect(cache).toMatchObject({
      schemaVersion: 1,
      accountUuidHash: createHash("sha256").update(FIXTURE_ACCOUNT_UUID).digest("hex"),
      chainId: 31337,
      contractAddress: LOCAL_BUDDY_NFT_ADDRESS,
      tokenId: "0x2a",
    });
    expect((cache as { frames: Record<string, string[]> }).frames).toMatchObject({
      f0: ["  .[||].", " [ -  - ]", " [ ==== ]"],
      f1: ["  .[||].", " [ o  - ]", " [ ==== ]"],
      f2: ["  .[||].", " [ -  o ]", " [ ==== ]"],
      fb: ["  .[||].", " [ ×  × ]", " [ ==== ]"],
    });
  });

  test("transient identity-resolve failure preserves cached warm state", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });

    const root = claudeConfigRoot;
    if (root === null) {
      throw new Error("test claude root not initialized");
    }

    const script = `
      import { resolveLookupPayload } from "./src/lookup-payload.ts";
      import { readState } from "./src/buddy-state.ts";

      const result = await resolveLookupPayload({
        accountUuidOverride: ${JSON.stringify(FIXTURE_ACCOUNT_UUID)},
      });
      console.log(JSON.stringify({ result, state: readState() }));
    `;

    const proc = Bun.spawn(["bun", "--eval", script], {
      cwd: PLUGIN_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: root,
        CLAUDE_CONFIG_DIR: root,
        BUDDY_NETWORK: "not-a-network",
      },
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;

    expect(proc.exitCode).toBe(0);
    expect(stderr).toBe("");

    const parsed = JSON.parse(stdout) as {
      result: LookupPayload | null;
      state: BuddyStateV4 | null;
    };
    expect(parsed.result).toBeNull();

    const finalState = parsed.state;
    expect(finalState).not.toBeNull();
    expect(finalState!.hatch).toBe("warm");
    expect(finalState!.tokenId).toBe("0xfeed");
    expectStateIdentity(finalState!, identity);
  });
});

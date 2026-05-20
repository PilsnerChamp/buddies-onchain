/**
 * Tests for `plugin/src/lookup.ts` — the cold/warm chain-state decision and
 * URL helpers used by slash rendering.
 *
 * Covers the four-state matrix (see `docs/plugin/architecture.md`
 * § State-driven handoff):
 *   - hatched (warm)             -> warm-hatched + tokenId
 *   - miss (cold)                -> cold-miss + tokenId 0n
 *   - anvil-down (soft-fail)     -> cold-rpc-unavailable
 *   - pre-deploy (no JSON)       -> cold-pre-deploy, no RPC
 *
 * Mocks the publicClient via `setPublicClientForTest` (no real RPC, no anvil
 * dependency). The pre-deploy case uses a `netOverride` to avoid having to
 * stub fs reads.
 *
 * Reference: docs/network-config.md.
 */

import { afterEach, describe, test, expect, mock } from "bun:test";
import type { PublicClient } from "viem";
import {
  hatchUrl,
  resolveDeepLink,
  siteOriginForKey,
  warmUrl,
} from "../src/lookup";
import { setPublicClientForTest } from "../src/publicClient";
import { type PluginNetworkInfo } from "../src/network";
import { NETWORKS } from "~shared/networks";

const TEST_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
const PROD_ORIGIN = "https://buddies-onchain.xyz";
const LOCAL_ORIGIN = "http://localhost:5173";
const FAKE_DEPLOYED_ADDR = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9" as const;

// Tests pass `netOverride` to `resolveDeepLink` so the pre-deploy / deployed
// branch is selected explicitly. We pin to `NETWORKS.mainnet` (not
// `ACTIVE_NETWORK`) so site-origin assertions stay hermetic regardless of
// whatever `BUDDY_NETWORK` the host shell has set.
const DEPLOYED_NET: PluginNetworkInfo = {
  ...NETWORKS.mainnet,
  buddyNft: FAKE_DEPLOYED_ADDR,
  deploymentBlock: 3,
};

const PRE_DEPLOY_NET: PluginNetworkInfo = {
  ...NETWORKS.mainnet,
  buddyNft: null,
  deploymentBlock: null,
};

function fakeClient(readContractImpl: () => Promise<unknown>): PublicClient {
  // Minimal stub matching the only method `lookup.ts` calls. Cast via
  // `unknown` because the real `PublicClient` has 100+ methods we don't need.
  return { readContract: readContractImpl } as unknown as PublicClient;
}

afterEach(() => {
  setPublicClientForTest(null);
});

describe("resolveDeepLink", () => {
  test("warm (hatched) returns reason warm-hatched with tokenId", async () => {
    setPublicClientForTest(fakeClient(async () => 42n));

    const result = await resolveDeepLink(TEST_UUID, DEPLOYED_NET);

    expect(result.reason).toBe("warm-hatched");
    expect(result.tokenId).toBe(42n);
  });

  test("cold-miss returns reason cold-miss with tokenId 0n", async () => {
    setPublicClientForTest(fakeClient(async () => 0n));

    const result = await resolveDeepLink(TEST_UUID, DEPLOYED_NET);

    expect(result.reason).toBe("cold-miss");
    expect(result.tokenId).toBe(0n);
  });

  test("RPC failure (anvil-down) soft-fails to cold-rpc-unavailable", async () => {
    setPublicClientForTest(
      fakeClient(async () => {
        throw new Error("HTTP request failed: ECONNREFUSED 127.0.0.1:8545");
      }),
    );

    const result = await resolveDeepLink(TEST_UUID, DEPLOYED_NET);

    expect(result.reason).toBe("cold-rpc-unavailable");
    expect(result.tokenId).toBeNull();
  });

  test("pre-deploy chain skips RPC and returns cold-pre-deploy", async () => {
    // No client stub on purpose — the function must not invoke it.
    const readSpy = mock(async () => {
      throw new Error("RPC must not be called for pre-deploy");
    });
    setPublicClientForTest(fakeClient(readSpy));

    const result = await resolveDeepLink(TEST_UUID, PRE_DEPLOY_NET);

    expect(result.reason).toBe("cold-pre-deploy");
    expect(result.tokenId).toBeNull();
    expect(readSpy).not.toHaveBeenCalled();
  });

  test("uppercase UUID resolves to the same identity hash as lowercase form", async () => {
    // The contract's `_validateUuid` (BuddyNFT.sol § _validateUuid) only
    // accepts the lowercase canonical form. Without trim+lowercase before
    // the keccak input, an uppercase `--uuid F47AC10B-...` would compute a
    // different identity hash than the same UUID in lowercase, and the
    // plugin would silently route to the cold path even when an on-chain
    // record exists. Site equivalents already canonicalize
    // (`useBuddyLookup.ts`, `Hatch.tsx`); this test guards the plugin side.
    const lowerUuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    const upperUuid = "F47AC10B-58CC-4372-A567-0E02B2C3D479";

    let lowerHashSeen: `0x${string}` | null = null;
    let upperHashSeen: `0x${string}` | null = null;

    setPublicClientForTest({
      readContract: async (call: { args: readonly unknown[] }) => {
        lowerHashSeen = call.args[0] as `0x${string}`;
        return 99n;
      },
    } as unknown as PublicClient);
    const lowerResult = await resolveDeepLink(lowerUuid, DEPLOYED_NET);

    setPublicClientForTest({
      readContract: async (call: { args: readonly unknown[] }) => {
        upperHashSeen = call.args[0] as `0x${string}`;
        return 99n;
      },
    } as unknown as PublicClient);
    const upperResult = await resolveDeepLink(upperUuid, DEPLOYED_NET);

    expect(lowerHashSeen).not.toBeNull();
    expect(upperHashSeen).toBe(lowerHashSeen!);
    expect(upperResult).toEqual(lowerResult);
  });

  test("trim+lowercase canonicalization handles whitespace-wrapped uppercase", async () => {
    // Belt-and-braces: `--uuid '  F47AC10B-... '` (whitespace + uppercase)
    // canonicalizes the same as bare lowercase. CLI shells sometimes leave
    // a stray trailing newline; gate stays robust to that.
    const messy = "  F47AC10B-58CC-4372-A567-0E02B2C3D479\n";
    const clean = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

    let messyHashSeen: `0x${string}` | null = null;
    let cleanHashSeen: `0x${string}` | null = null;

    setPublicClientForTest({
      readContract: async (call: { args: readonly unknown[] }) => {
        messyHashSeen = call.args[0] as `0x${string}`;
        return 0n;
      },
    } as unknown as PublicClient);
    await resolveDeepLink(messy, DEPLOYED_NET);

    setPublicClientForTest({
      readContract: async (call: { args: readonly unknown[] }) => {
        cleanHashSeen = call.args[0] as `0x${string}`;
        return 0n;
      },
    } as unknown as PublicClient);
    await resolveDeepLink(clean, DEPLOYED_NET);

    expect(messyHashSeen).toBe(cleanHashSeen!);
  });
});

describe("URL helpers", () => {
  test("hatchUrl and warmUrl URL-encode the accountUuid", () => {
    const trickUuid = "a/b c+d&e=f";

    expect(warmUrl(PROD_ORIGIN, trickUuid)).toBe(
      `${PROD_ORIGIN}/view/${encodeURIComponent(trickUuid)}`,
    );
    expect(hatchUrl(PROD_ORIGIN, trickUuid)).toBe(
      `${PROD_ORIGIN}/hatch?accountUuid=${encodeURIComponent(trickUuid)}`,
    );
  });
});

describe("siteOriginForKey — local-vs-prod gating", () => {
  test("local key returns localhost:5173", () => {
    expect(siteOriginForKey("local")).toBe(LOCAL_ORIGIN);
  });

  test("sepolia key returns production origin", () => {
    expect(siteOriginForKey("sepolia")).toBe(PROD_ORIGIN);
  });

  test("mainnet key returns production origin", () => {
    expect(siteOriginForKey("mainnet")).toBe(PROD_ORIGIN);
  });
});

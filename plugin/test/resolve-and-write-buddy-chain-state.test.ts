import { existsSync, readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, test, expect } from "bun:test";
import { resolveAndWriteBuddyChainState } from "../src/lookup-payload";
import { setPublicClientForTest } from "../src/publicClient";
import {
  mutateState,
  readState,
  type BuddyStateV4,
  type IdentityTuple,
} from "../src/buddy-state";
import {
  FIXTURE_ACCOUNT_UUID,
  MOCK_DEPLOYED_NET,
  MOCK_PRE_DEPLOY_NET,
  artCachePath,
  cleanupLookupFixtureEnv,
  expectStateIdentity,
  fakeReadContractClient,
  fakeReadContractClientByFunction,
  installTempClaudeConfigRoot,
  readIdentityTuple,
  seedBuddyArtCache,
  seedBuddyState,
} from "./_helpers/lookup-fixtures";

beforeEach(() => {
  installTempClaudeConfigRoot();
});

afterEach(() => {
  cleanupLookupFixtureEnv();
});

describe("resolveAndWriteBuddyChainState", () => {
  test("session-start warm verified writes warm state with tokenId", async () => {
    const identity = await readIdentityTuple();
    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 0x2an,
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "session-start",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("warm");
    expect(result.state.tokenId).toBe("0x2a");
    expect(result.identity).toEqual(identity);
    expectStateIdentity(result.state, identity);
    expect(readState()).toEqual(result.state);
  });

  test("session-start cold verified writes cold state and clears art cache", async () => {
    const identity = await readIdentityTuple();
    seedBuddyArtCache(identity);
    setPublicClientForTest(fakeReadContractClient(async () => 0n));

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "session-start",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("cold");
    expect(result.state.tokenId).toBeNull();
    expectStateIdentity(result.state, identity);
    expect(existsSync(artCachePath())).toBe(false);
  });

  test("session-start pre-deploy force-demotes cached warm to unknown", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "session-start",
      netOverride: MOCK_PRE_DEPLOY_NET,
    });

    expect(result.chainStatus).toBe("offline");
    expect(result.state.hatch).toBe("unknown");
    expect(result.state.tokenId).toBeNull();
    expectStateIdentity(result.state, identity);
  });

  test("session-start RPC fail force-demotes cached warm but preserves art cache file", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });
    seedBuddyArtCache(identity);
    const cachedArt = readFileSync(artCachePath(), "utf8");
    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unavailable");
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "session-start",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("offline");
    expect(result.state.hatch).toBe("unknown");
    expect(result.state.tokenId).toBeNull();
    expect(readFileSync(artCachePath(), "utf8")).toBe(cachedArt);
  });

  test("session-start RPC fail preserves cached cold while offline", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "cold",
      tokenId: null,
    });
    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unavailable");
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "session-start",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("offline");
    expect(result.state.hatch).toBe("cold");
    expect(result.state.tokenId).toBeNull();
    expectStateIdentity(result.state, identity);
  });

  test("fresh session-start RPC fail writes unknown state", async () => {
    const identity = await readIdentityTuple();
    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unavailable");
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "session-start",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("offline");
    expect(result.state.hatch).toBe("unknown");
    expect(result.state.tokenId).toBeNull();
    expectStateIdentity(result.state, identity);
  });

  test("slash warm verified writes warm online state", async () => {
    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 0x2an,
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("warm");
    expect(result.state.tokenId).toBe("0x2a");
  });

  test("slash cold verified writes cold state and clears art cache", async () => {
    const identity = await readIdentityTuple();
    seedBuddyArtCache(identity);
    setPublicClientForTest(fakeReadContractClient(async () => 0n));

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("cold");
    expect(result.state.tokenId).toBeNull();
    expect(existsSync(artCachePath())).toBe(false);
  });

  test("slash confirmed cold resets cold nudge counter", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "cold",
      tokenId: null,
      coldNudgeCounter: 7,
    });
    setPublicClientForTest(fakeReadContractClient(async () => 0n));

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });
    const persisted = readState();

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("cold");
    expect(result.state.coldNudgeCounter).toBe(0);
    expect(persisted?.coldNudgeCounter).toBe(0);
  });

  test("slash warm verified preserves cold nudge counter", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "cold",
      tokenId: null,
      coldNudgeCounter: 7,
    });
    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 0x2an,
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });
    const persisted = readState();

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("warm");
    expect(result.state.tokenId).toBe("0x2a");
    expect(result.state.coldNudgeCounter).toBe(7);
    expect(persisted?.coldNudgeCounter).toBe(7);
  });

  test("slash pre-deploy does not reset cold nudge counter", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "cold",
      tokenId: null,
      coldNudgeCounter: 7,
    });

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_PRE_DEPLOY_NET,
    });
    const persisted = readState();

    expect(result.chainStatus).toBe("offline");
    expect(result.state.coldNudgeCounter).toBe(7);
    expect(persisted?.coldNudgeCounter).toBe(7);
  });

  test("session-start confirmed cold preserves cold nudge counter", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "cold",
      tokenId: null,
      coldNudgeCounter: 5,
    });
    setPublicClientForTest(fakeReadContractClient(async () => 0n));

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "session-start",
      netOverride: MOCK_DEPLOYED_NET,
    });
    const persisted = readState();

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("cold");
    expect(result.state.coldNudgeCounter).toBe(5);
    expect(persisted?.coldNudgeCounter).toBe(5);
  });

  test("identity mismatch reset zeroes cold nudge counter on resolver path", async () => {
    const identity = await readIdentityTuple();
    const staleIdentity: IdentityTuple = {
      ...identity,
      accountUuidHash: "f".repeat(64),
    };
    seedBuddyState(staleIdentity, {
      hatch: "warm",
      tokenId: "0xfeed",
      coldNudgeCounter: 7,
    });
    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 0x2an,
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });
    const persisted = readState();

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("warm");
    expect(result.state.coldNudgeCounter).toBe(0);
    expectStateIdentity(result.state, identity);
    expect(persisted?.coldNudgeCounter).toBe(0);
    expectStateIdentity(persisted!, identity);
  });

  test("warm-cached state downgrades to cold and clears art cache on confirmed cold miss", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });
    seedBuddyArtCache(identity);
    setPublicClientForTest(fakeReadContractClient(async () => 0n));

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("online");
    expect(result.state.hatch).toBe("cold");
    expect(result.state.tokenId).toBeNull();
    expect(existsSync(artCachePath())).toBe(false);
  });

  test("slash pre-deploy preserves cached warm while offline", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_PRE_DEPLOY_NET,
    });

    expect(result.chainStatus).toBe("offline");
    expect(result.state.hatch).toBe("warm");
    expect(result.state.tokenId).toBe("0xfeed");
  });

  test("slash RPC fail preserves cached warm/token while offline", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });
    setPublicClientForTest(
      fakeReadContractClient(async () => {
        throw new Error("rpc unavailable");
      }),
    );

    const result = await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });

    expect(result.chainStatus).toBe("offline");
    expect(result.state.hatch).toBe("warm");
    expect(result.state.tokenId).toBe("0xfeed");
  });

  test("monotonic merge keeps warm cache after a stale unknown write", async () => {
    const identity = await readIdentityTuple();
    seedBuddyState(identity, {
      hatch: "warm",
      tokenId: "0xfeed",
    });

    setPublicClientForTest(
      fakeReadContractClientByFunction({
        getTokenIdByIdentity: async () => 0xfeedn,
      }),
    );

    await resolveAndWriteBuddyChainState({
      accountUuid: FIXTURE_ACCOUNT_UUID,
      context: "slash",
      netOverride: MOCK_DEPLOYED_NET,
    });

    mutateState((state) => ({
      ...state,
      ...identity,
      hatch: "unknown",
      tokenId: null,
    }));

    const state = readState();
    expect(state).not.toBeNull();
    expect(state!.hatch).toBe("warm");
    expect(state!.tokenId).toBe("0xfeed");
    expectStateIdentity(state!, identity);
  });

  test.each(["session-start", "slash"] as const)(
    "identity mismatch resets stale warm before cold result in %s context",
    async (context) => {
      const identity = await readIdentityTuple();
      const staleIdentity: IdentityTuple = {
        ...identity,
        accountUuidHash: "f".repeat(64),
      };
      seedBuddyState(staleIdentity, {
        hatch: "warm",
        tokenId: "0xfeed",
      });
      seedBuddyArtCache(staleIdentity);

      let stateDuringResolve: BuddyStateV4 | null = null;
      setPublicClientForTest(
        fakeReadContractClientByFunction({
          getTokenIdByIdentity: async () => {
            stateDuringResolve = readState();
            return 0n;
          },
        }),
      );

      const result = await resolveAndWriteBuddyChainState({
        accountUuid: FIXTURE_ACCOUNT_UUID,
        context,
        netOverride: MOCK_DEPLOYED_NET,
      });

      expect(stateDuringResolve).not.toBeNull();
      expect(stateDuringResolve!.hatch).toBe("unknown");
      expect(stateDuringResolve!.tokenId).toBeNull();
      expectStateIdentity(stateDuringResolve!, identity);
      expect(result.chainStatus).toBe("online");
      expect(result.state.hatch).toBe("cold");
      expect(result.state.tokenId).toBeNull();
      expect(result.identity).toEqual(identity);
      expectStateIdentity(result.state, identity);
      expect(existsSync(artCachePath())).toBe(false);
    },
  );

  test.each(["session-start", "slash"] as const)(
    "identity mismatch clears art cache and resolves current identity in %s context",
    async (context) => {
      const identity = await readIdentityTuple();
      const staleIdentity: IdentityTuple = {
        ...identity,
        accountUuidHash: "f".repeat(64),
      };
      seedBuddyState(staleIdentity, {
        hatch: "warm",
        tokenId: "0xfeed",
      });
      seedBuddyArtCache(staleIdentity);

      let stateDuringResolve: BuddyStateV4 | null = null;
      setPublicClientForTest(
        fakeReadContractClientByFunction({
          getTokenIdByIdentity: async () => {
            stateDuringResolve = readState();
            return 0x2an;
          },
        }),
      );

      const result = await resolveAndWriteBuddyChainState({
        accountUuid: FIXTURE_ACCOUNT_UUID,
        context,
        netOverride: MOCK_DEPLOYED_NET,
      });

      expect(stateDuringResolve).not.toBeNull();
      expect(stateDuringResolve!.hatch).toBe("unknown");
      expect(stateDuringResolve!.tokenId).toBeNull();
      expectStateIdentity(stateDuringResolve!, identity);
      expect(result.state.hatch).toBe("warm");
      expect(result.state.tokenId).toBe("0x2a");
      expect(result.identity).toEqual(identity);
      expectStateIdentity(result.state, identity);
      expect(existsSync(artCachePath())).toBe(false);
    },
  );
});

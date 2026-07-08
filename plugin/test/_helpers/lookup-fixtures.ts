import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { expect } from "bun:test";
import {
  defaultState,
  readIdentityTuple,
  statePath,
  type BuddyStateV4,
  type IdentityTuple,
} from "../../src/buddy-state";
import { ACTIVE_NETWORK, type PluginNetworkInfo } from "../../src/network";
import { artCachePath } from "../../src/art-cache";
import { setPublicClientForTest } from "../../src/publicClient";
import type { PublicClient } from "viem";

export { artCachePath, readIdentityTuple };

export const FIXTURE_ACCOUNT_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";

const FAKE_DEPLOYED_CONTRACT_ADDRESS =
  "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9" as const;
export const LOCAL_BUDDY_NFT_ADDRESS =
  "0xdc64a140aa3e981100a9beca4e685f962f0cf6c9";

// Synthetic deployed network for publicClient-mocked branches. Spreads the
// active network so chainId matches the deployments map, then overlays a fake
// `buddyNft` so `resolveDeepLink` runs the RPC branch.
export const MOCK_DEPLOYED_NET: PluginNetworkInfo = {
  ...ACTIVE_NETWORK,
  buddyNft: FAKE_DEPLOYED_CONTRACT_ADDRESS,
  deploymentBlock: 3,
};

export const MOCK_PRE_DEPLOY_NET: PluginNetworkInfo = {
  ...MOCK_DEPLOYED_NET,
  buddyNft: null,
  deploymentBlock: null,
};

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
const ORIGINAL_BUDDY_MODE = process.env.BUDDY_MODE;

let tempConfigRoots: string[] = [];

export function fakeReadContractClient(impl: () => Promise<unknown>): PublicClient {
  return { readContract: impl } as unknown as PublicClient;
}

export function fakeReadContractClientByFunction(impls: {
  getTokenIdByIdentity?: () => Promise<bigint>;
  tokenURI?: () => Promise<string>;
}): PublicClient {
  return {
    readContract: async (call: { functionName: string }) => {
      if (call.functionName === "getTokenIdByIdentity" && impls.getTokenIdByIdentity) {
        return impls.getTokenIdByIdentity();
      }
      if (call.functionName === "tokenURI" && impls.tokenURI) {
        return impls.tokenURI();
      }
      throw new Error(`unexpected readContract call: ${call.functionName}`);
    },
  } as unknown as PublicClient;
}

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function writeClaudeConfig(root: string, accountUuid: string): void {
  writeFileSync(
    join(root, ".claude.json"),
    JSON.stringify({ oauthAccount: { accountUuid } }),
  );
}

export function installTempClaudeConfigRoot(
  accountUuid: string = FIXTURE_ACCOUNT_UUID,
): string {
  const root = mkdtempSync(join(tmpdir(), "buddy-lookup-"));
  tempConfigRoots.push(root);

  process.env.HOME = root;
  process.env.CLAUDE_CONFIG_DIR = root;
  delete process.env.BUDDY_MODE;

  writeClaudeConfig(root, accountUuid);
  return root;
}

export function cleanupLookupFixtureEnv(): void {
  setPublicClientForTest(null);

  for (const root of tempConfigRoots) {
    rmSync(root, { recursive: true, force: true });
  }

  tempConfigRoots = [];

  restoreEnvVar("HOME", ORIGINAL_HOME);
  restoreEnvVar("CLAUDE_CONFIG_DIR", ORIGINAL_CLAUDE_CONFIG_DIR);
  restoreEnvVar("BUDDY_MODE", ORIGINAL_BUDDY_MODE);
}

export function seedBuddyState(
  identity: IdentityTuple,
  patch: Partial<BuddyStateV4>,
): void {
  const state: BuddyStateV4 = {
    ...defaultState(),
    ...identity,
    ...patch,
    schemaVersion: 4,
  };

  mkdirSync(dirname(statePath()), { recursive: true });
  writeFileSync(statePath(), JSON.stringify(state));
}

export function seedBuddyArtCache(
  identity: IdentityTuple,
  tokenId: string = "0xfeed",
): void {
  mkdirSync(dirname(artCachePath()), { recursive: true });
  writeFileSync(
    artCachePath(),
    JSON.stringify({
      schemaVersion: 1,
      accountUuidHash:
        identity.accountUuidHash ??
        createHash("sha256").update(FIXTURE_ACCOUNT_UUID).digest("hex"),
      chainId: identity.chainId ?? 1,
      contractAddress: identity.contractAddress ?? LOCAL_BUDDY_NFT_ADDRESS,
      tokenId,
      frames: { f0: ["stale"] },
      cachedAtMs: 111,
    }),
  );
}

export function expectStateIdentity(
  state: BuddyStateV4,
  identity: IdentityTuple,
): void {
  expect(state.accountUuidHash).toBe(identity.accountUuidHash);
  expect(state.chainId).toBe(identity.chainId);
  expect(state.contractAddress).toBe(identity.contractAddress);
}

/**
 * Process-level E2E for the SessionStart art-cache rebuild abort.
 *
 * The regression this pins: `ensureWarmArtCache` races `tokenURI` against a
 * timer, but a race only bounds the code path — an abandoned in-flight fetch
 * keeps the event loop (and the hook process) alive until viem gives up,
 * blowing the 5s SessionStart hook budget and losing the emitted ruleset.
 * In-process mocks cannot catch this (`new Promise(() => {})` holds no
 * active handle), so the built bundle runs as a real subprocess against a
 * local JSON-RPC stub that answers the identity lookup and stalls
 * `tokenURI` — before headers and mid-body — while counting per-selector
 * attempts to prove `retryCount: 0`.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { decodeFunctionData } from "viem";

import { BUDDY_NFT_ABI } from "../src/buddyNftAbi";

const TEST_UUID = "47492784-eec5-4983-8072-9e2aa832c24b";
const PLUGIN_ROOT = join(import.meta.dir, "..");
const DIST = join(PLUGIN_ROOT, "dist", "index.js");
const RULESET_PREFIX = "BUDDIES ONCHAIN AMBIENT — ";
const TOKEN_ID_RESULT = `0x${(0x2an).toString(16).padStart(64, "0")}`;

type StallMode = "no-headers" | "partial-body";

const tmpDirs: string[] = [];
const servers: Array<{ stop: (force?: boolean) => void }> = [];

afterEach(() => {
  for (const server of servers) server.stop(true);
  servers.length = 0;
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function freshClaudeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "buddy-session-stall-"));
  tmpDirs.push(dir);
  mkdirSync(join(dir, "plugins", "buddy-onchain"), { recursive: true });
  writeFileSync(
    join(dir, ".claude.json"),
    JSON.stringify({ oauthAccount: { accountUuid: TEST_UUID } }),
  );
  return dir;
}

function rpcResult(id: unknown, result: string): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function neverRespond(): Promise<Response> {
  return new Promise<Response>(() => {});
}

function partialBodyResponse(): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"resu'),
        );
        // Never close — body stalls after headers and a partial payload.
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

function startStubRpc(stall: StallMode): {
  url: string;
  counts: Map<string, number>;
} {
  const counts = new Map<string, number>();

  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const payload = (await req.json()) as {
        id: unknown;
        method: string;
        params?: Array<{ data?: `0x${string}` }>;
      };
      if (payload.method !== "eth_call" || !payload.params?.[0]?.data) {
        return Response.json({
          jsonrpc: "2.0",
          id: payload.id,
          error: { code: -32601, message: `unexpected method ${payload.method}` },
        });
      }

      const { functionName } = decodeFunctionData({
        abi: BUDDY_NFT_ABI,
        data: payload.params[0].data,
      });
      counts.set(functionName, (counts.get(functionName) ?? 0) + 1);

      if (functionName === "getTokenIdByIdentity") {
        return rpcResult(payload.id, TOKEN_ID_RESULT);
      }
      if (functionName === "tokenURI") {
        return stall === "no-headers" ? neverRespond() : partialBodyResponse();
      }
      return Response.json({
        jsonrpc: "2.0",
        id: payload.id,
        error: { code: -32601, message: `unexpected call ${functionName}` },
      });
    },
  });
  servers.push(server);

  return { url: `http://127.0.0.1:${server.port}`, counts };
}

async function runDistSessionStart(
  claudeDir: string,
  rpcUrl: string,
): Promise<{ exitCode: number | null; stdout: string; elapsedMs: number }> {
  const startedAt = Date.now();
  const proc = Bun.spawn(["node", DIST, "--session-start"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: claudeDir,
      CLAUDE_CONFIG_DIR: claudeDir,
      BUDDY_TEST_RPC_URL: rpcUrl,
    },
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return { exitCode: proc.exitCode, stdout, elapsedMs: Date.now() - startedAt };
}

describe("SessionStart with a stalled tokenURI RPC", () => {
  test.each<StallMode>(["no-headers", "partial-body"])(
    "%s stall: process exits fast with the ruleset, one attempt, no cache",
    async (stall) => {
      const claudeDir = freshClaudeDir();
      const stub = startStubRpc(stall);

      const run = await runDistSessionStart(claudeDir, stub.url);

      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain(RULESET_PREFIX);
      // Abort fires at 1500ms; anything near viem's 10s-per-attempt default
      // (or the 5s hook kill) means the process was pinned by the fetch.
      expect(run.elapsedMs).toBeLessThan(3500);
      expect(stub.counts.get("getTokenIdByIdentity")).toBe(1);
      expect(stub.counts.get("tokenURI")).toBe(1);
      expect(
        existsSync(
          join(claudeDir, "plugins", "buddy-onchain", ".buddy-art-cache.json"),
        ),
      ).toBe(false);
    },
    15_000,
  );
});

/**
 * Tests for `plugin/src/network.ts` — the deployment loader and
 * `getActiveNetwork()` merge accessor.
 *
 * Mirrors site-side `buildDeployments` semantics against the plugin's
 * fs-based loader (see `docs/network-config.md` § Deployment manifests):
 *   - committed local deployment file (chainId 31337) loads + merges cleanly
 *   - missing deployment file => returns null (soft case)
 *   - filename↔payload chainId mismatch => throws (hard fail)
 *   - malformed JSON => throws (hard fail)
 *
 * The integrity-assertion + malformed-JSON tests exercise the production
 * `loadDeployment` directly via its `dirOverride` test seam (added so tests
 * can point the loader at a tmpdir fixture without poking files into
 * `onchain/deployments/` — that would be visible to git status mid-test).
 * No shadow-loader replica: any drift in the production branch logic shows
 * up here directly.
 *
 * Reference: docs/network-config.md.
 */

import { afterEach, describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDeployment } from "../src/network";

const REAL_LOCAL_CHAIN_ID = 31337;
const REAL_LOCAL_BUDDYNFT =
  "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9" as const;
const PLUGIN_ROOT = join(import.meta.dir, "..");

// `ACTIVE_NETWORK` resolves once on first property read and caches. Asserting
// its env-driven default in-process is fragile: the test inherits whatever
// `BUDDY_NETWORK` the host shell exports (e.g. `BUDDY_NETWORK=local` for
// devs running the local Anvil flow). Run the assertion in a subprocess with
// the variable scrubbed so it's hermetic.
describe("ACTIVE_NETWORK — module-level env validation", () => {
  test("ACTIVE_NETWORK defaults to mainnet when BUDDY_NETWORK is unset", async () => {
    const script = `
      import { ACTIVE_NETWORK } from "${join(PLUGIN_ROOT, "src", "network.ts")}";
      process.stdout.write(ACTIVE_NETWORK.key);
    `;
    const { BUDDY_NETWORK: _omit, ...cleanEnv } = process.env;
    const proc = Bun.spawn(["bun", "--eval", script], {
      stdout: "pipe",
      stderr: "pipe",
      env: cleanEnv as Record<string, string>,
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    expect(stdout).toBe("mainnet");
  });
});

describe("loadDeployment (real on-disk fixture)", () => {
  test("loads plugin/deployments/31337.json", () => {
    const d = loadDeployment(REAL_LOCAL_CHAIN_ID);
    expect(d).not.toBeNull();
    expect(d!.chainId).toBe(REAL_LOCAL_CHAIN_ID);
    expect(d!.addresses?.BuddyNFT).toBe(REAL_LOCAL_BUDDYNFT);
    expect(typeof d!.buddyNftBlock).toBe("number");
  });

  test("returns null for a chainId without a committed deployment file", () => {
    // 8453 (mainnet) currently has no deployment JSON committed; pick one
    // that's also unambiguously not local.
    const d = loadDeployment(8453);
    // Only assert null if the file genuinely doesn't exist on disk; if a
    // mainnet deploy lands later this test should adapt rather than
    // false-fail.
    const path = join(
      __dirname,
      "..",
      "..",
      "onchain",
      "deployments",
      "8453.json",
    );
    if (existsSync(path)) {
      expect(d).not.toBeNull();
    } else {
      expect(d).toBeNull();
    }
  });
});

describe("loadDeployment integrity contract (production loader + tmpdir)", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("throws on filename↔payload chainId mismatch", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "buddy-net-test-"));
    writeFileSync(
      join(tmpDir, "31337.json"),
      JSON.stringify({
        chainId: 8453, // payload disagrees with filename
        deployer: "0x0000000000000000000000000000000000000000",
        buddyNftBlock: 1,
        addresses: { BuddyNFT: "0x0000000000000000000000000000000000000001" },
      }),
    );
    expect(() => loadDeployment(31337, tmpDir)).toThrow(/chainId mismatch/);
  });

  test("throws on malformed JSON", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "buddy-net-test-"));
    writeFileSync(join(tmpDir, "31337.json"), "{ not valid json");
    expect(() => loadDeployment(31337, tmpDir)).toThrow();
  });

  test("returns null on missing file (soft case)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "buddy-net-test-"));
    // No file written — only the empty dir exists.
    expect(loadDeployment(31337, tmpDir)).toBeNull();
  });

  test("loads and merges a synthetic deployment when chainId matches", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "buddy-net-test-"));
    const fakeAddr = "0x00000000000000000000000000000000000000aa" as const;
    writeFileSync(
      join(tmpDir, "31337.json"),
      JSON.stringify({
        chainId: 31337,
        deployer: "0x0000000000000000000000000000000000000000",
        buddyNftBlock: 7,
        addresses: { BuddyNFT: fakeAddr },
      }),
    );
    const d = loadDeployment(31337, tmpDir);
    expect(d).not.toBeNull();
    expect(d!.chainId).toBe(31337);
    expect(d!.buddyNftBlock).toBe(7);
    expect(d!.addresses?.BuddyNFT).toBe(fakeAddr);
  });
});

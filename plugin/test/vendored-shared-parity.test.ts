import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Drift guard for the vendored `plugin/src/*` copies of `shared/*`.
//
// The published plugin ships a self-contained `plugin/src/` — the five shared
// primitives are copied in verbatim (see each file's "Vendored from" header) so
// installers can audit the source without the `~shared/*` alias resolving. That
// duplication is deliberate, but two sources of truth can silently diverge. This
// test fails the moment a vendored copy stops matching the shared original the
// site consumes, so "keep byte-for-byte in sync" is enforced, not just asked.

import { computeIdentityHash as vendoredComputeIdentityHash } from "../src/computeIdentityHash";
import { assertCanonicalV4Uuid as vendoredAssert } from "../src/assertCanonicalV4Uuid";
import { isValidUuid as vendoredIsValidUuid } from "../src/isValidUuid";
import {
  CLAUDE_PROVIDER as vendoredProvider,
  CLAUDE_PROVIDER_BYTES16 as vendoredProviderBytes16,
  encodeProviderBytes16 as vendoredEncode,
  decodeProviderBytes16 as vendoredDecode,
} from "../src/providerBytes16";
import { BUDDY_NFT_ABI as vendoredAbi } from "../src/buddyNftAbi";

import { computeIdentityHash as sharedComputeIdentityHash } from "~shared/computeIdentityHash";
import { assertCanonicalV4Uuid as sharedAssert } from "~shared/assertCanonicalV4Uuid";
import { isValidUuid as sharedIsValidUuid } from "~shared/isValidUuid";
import {
  CLAUDE_PROVIDER as sharedProvider,
  CLAUDE_PROVIDER_BYTES16 as sharedProviderBytes16,
  encodeProviderBytes16 as sharedEncode,
  decodeProviderBytes16 as sharedDecode,
} from "~shared/providerBytes16";
import { BUDDY_NFT_ABI as sharedAbi } from "~shared/buddyNftAbi";

import { ACTIVE_NETWORK } from "../src/network";
import { NETWORKS } from "~shared/networks";

const UUIDS = [
  "00000000-0000-4000-8000-000000000000",
  "ffffffff-ffff-4fff-bfff-ffffffffffff",
  "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "9b2e4c1a-7d6f-42ab-8c3e-1f0a5b6d7e80",
];

const NOT_V4 = [
  "not-a-uuid",
  "3f2504e0-4f89-11d3-9a0c-0305e82c3301", // v1
  "3f2504e04f8941d39a0c0305e82c3301",
  "3F2504E0-4F89-41D3-9A0C-0305E82C3301", // uppercase — assert must reject
];

describe("vendored plugin/src copies stay identical to shared originals", () => {
  test("value exports are deep-equal", () => {
    expect(vendoredProvider).toBe(sharedProvider);
    expect(vendoredProviderBytes16).toBe(sharedProviderBytes16);
    expect(vendoredAbi).toEqual(sharedAbi);
  });

  test("computeIdentityHash produces identical digests", () => {
    for (const uuid of UUIDS) {
      expect(vendoredComputeIdentityHash(uuid)).toBe(sharedComputeIdentityHash(uuid));
    }
  });

  test("isValidUuid classifies identically", () => {
    for (const value of [...UUIDS, ...NOT_V4]) {
      expect(vendoredIsValidUuid(value)).toBe(sharedIsValidUuid(value));
    }
  });

  test("assertCanonicalV4Uuid accepts/throws identically", () => {
    for (const uuid of UUIDS) {
      expect(() => vendoredAssert(uuid)).not.toThrow();
      expect(() => sharedAssert(uuid)).not.toThrow();
    }
    for (const bad of NOT_V4) {
      expect(() => vendoredAssert(bad)).toThrow();
      expect(() => sharedAssert(bad)).toThrow();
    }
  });

  test("provider codec round-trips identically", () => {
    for (const provider of [vendoredProvider, "codex", "gemini"]) {
      expect(vendoredEncode(provider)).toBe(sharedEncode(provider));
      const enc = vendoredEncode(provider);
      expect(vendoredDecode(enc)).toBe(sharedDecode(enc));
    }
  });

  // The behavioral checks above can't catch a behavior-preserving hand-edit to
  // a vendored copy. This byte-level check can: rebuild what `sync-shared`
  // would write (its generated header + the shared source minus its path
  // banner — logic mirrored from `plugin/scripts/sync-shared.ts`) and require
  // the on-disk vendored file to match exactly.
  test("vendored files are byte-identical to a fresh sync-shared output", () => {
    const pluginRoot = join(import.meta.dir, "..");
    const sharedDir = join(pluginRoot, "..", "shared");

    const VENDORED = [
      "isValidUuid.ts",
      "assertCanonicalV4Uuid.ts",
      "computeIdentityHash.ts",
      "providerBytes16.ts",
      "buddyNftAbi.ts",
    ];

    const vendoredHeader = (basename: string) =>
      [
        `// plugin/src/${basename}`,
        "//",
        "// GENERATED FILE — DO NOT EDIT DIRECTLY.",
        `// Vendored copy of \`shared/${basename}\`, produced by \`bun run sync-shared\``,
        "// (wired into `bun run build`). `shared/` is the source of truth; the site",
        "// imports it directly, the mainnet-only plugin ships this self-contained copy.",
        `// Edit \`shared/${basename}\` and re-run \`bun run sync-shared\` — never hand-edit`,
        "// this file. Drift is caught by `plugin/test/vendored-shared-parity.test.ts`",
        "// and `just plugin-check-dist`.",
        "//",
        "// Original doc comments from the shared source follow verbatim.",
        "",
      ].join("\n");

    const stripSharedPathBanner = (source: string, basename: string) => {
      const lines = source.split("\n");
      if (lines[0]?.trim() === `// shared/${basename}`) {
        lines.shift();
        if (lines[0]?.trim() === "//") lines.shift();
      }
      return lines.join("\n");
    };

    for (const basename of VENDORED) {
      const shared = readFileSync(join(sharedDir, basename), "utf8");
      const expected = `${vendoredHeader(basename)}\n${stripSharedPathBanner(shared, basename)}`;
      const vendored = readFileSync(join(pluginRoot, "src", basename), "utf8");
      expect(vendored).toBe(expected);
    }
  });
});

describe("vendored mainnet network constants stay identical to shared/networks.ts", () => {
  // `plugin/src/network.ts` inlines `NETWORKS.mainnet` by hand (it is not in
  // sync-shared's VENDORED list — the plugin deliberately drops the other two
  // chains). This guard makes the "keep in sync" comment enforceable: any
  // change to the shared mainnet entry (rpcUrl, explorer, OpenSea surfaces)
  // must be mirrored into the plugin copy.
  test("ACTIVE_NETWORK equals NETWORKS.mainnet field-for-field", () => {
    expect(ACTIVE_NETWORK).toEqual(NETWORKS.mainnet);
  });
});

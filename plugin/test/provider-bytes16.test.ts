import { describe, expect, test } from "bun:test";

import { BUDDY_NFT_ABI } from "../src/buddyNftAbi";
import {
  CLAUDE_PROVIDER,
  CLAUDE_PROVIDER_BYTES16,
  decodeProviderBytes16,
  encodeProviderBytes16,
  type ProviderBytes16,
} from "../src/providerBytes16";

interface AbiEntry {
  type: string;
  name?: string;
  stateMutability?: string;
  anonymous?: boolean;
  inputs?: readonly unknown[];
  outputs?: readonly unknown[];
}

function abiEntry(type: string, name: string): AbiEntry {
  const entry = (BUDDY_NFT_ABI as readonly AbiEntry[]).find(
    (candidate) => candidate.type === type && candidate.name === name
  );
  if (!entry) {
    throw new Error(`missing ${type} ${name} ABI entry`);
  }
  return entry;
}

describe("provider bytes16 codec", () => {
  test("round-trips the Claude provider value", () => {
    const encoded = encodeProviderBytes16(CLAUDE_PROVIDER);

    expect(encoded).toBe(CLAUDE_PROVIDER_BYTES16);
    expect(encoded).toBe("0x636c6175646500000000000000000000");
    expect(decodeProviderBytes16(encoded)).toBe(CLAUDE_PROVIDER);
  });

  test("round-trips a full 16-byte provider value without padding", () => {
    const encoded = encodeProviderBytes16("abcdefghijklmnop");

    expect(encoded).toBe("0x6162636465666768696a6b6c6d6e6f70");
    expect(decodeProviderBytes16(encoded)).toBe("abcdefghijklmnop");
  });

  test("rejects provider labels the contract rejects", () => {
    const invalidProviders = [
      "Claude",
      "clau_de",
      "claude!",
      "claude.eth",
      "",
      "abcdefghijklmnopq",
      "claudé",
    ];

    for (const provider of invalidProviders) {
      expect(() => encodeProviderBytes16(provider)).toThrow();
    }
  });

  test("rejects bytes16 values that cannot be valid onchain providers", () => {
    const invalidProviderBytes = [
      "0x",
      "0x00000000000000000000000000000000",
      "0x636c0061756465000000000000000000",
      "0x436c6175646500000000000000000000",
      "0x636c61756465000000000000000000zz",
    ] as const;

    for (const providerBytes of invalidProviderBytes) {
      expect(() =>
        decodeProviderBytes16(providerBytes as ProviderBytes16)
      ).toThrow();
    }
  });
});

describe("BuddyNFT shared ABI provider shape", () => {
  test("hatch accepts the provider bytes16 argument", () => {
    const hatch = abiEntry("function", "hatch");

    expect(hatch.stateMutability).toBe("nonpayable");
    expect(hatch.inputs).toEqual([
      { name: "identityHash", type: "bytes32" },
      { name: "prngSeed", type: "uint32" },
      { name: "provider", type: "bytes16" },
    ]);
    expect(hatch.outputs).toEqual([{ name: "tokenId", type: "uint256" }]);
  });

  test("buddyProvider exposes the stored provider bytes16", () => {
    const buddyProvider = abiEntry("function", "buddyProvider");

    expect(buddyProvider.stateMutability).toBe("view");
    expect(buddyProvider.inputs).toEqual([
      { name: "tokenId", type: "uint256" },
    ]);
    expect(buddyProvider.outputs).toEqual([{ name: "", type: "bytes16" }]);
  });

  test("Awakened decodes the non-indexed provider bytes16 payload", () => {
    const awakened = abiEntry("event", "Awakened");

    expect(awakened.anonymous).toBe(false);
    expect(awakened.inputs).toEqual([
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "identityHash", type: "bytes32", indexed: true },
      { name: "hatcher", type: "address", indexed: true },
      { name: "provider", type: "bytes16", indexed: false },
    ]);
  });

  test("InvalidProvider is available for revert decoding", () => {
    const invalidProvider = abiEntry("error", "InvalidProvider");

    expect(invalidProvider.inputs).toEqual([]);
  });
});

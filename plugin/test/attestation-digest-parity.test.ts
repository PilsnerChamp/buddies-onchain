/**
 * Cross-domain EIP-712 attestation digest parity test.
 *
 * Reads the shared JSON vectors at
 * `onchain/test/vectors/attestation-digest-vectors.json` -- the same file the
 * Foundry test suite consumes -- and asserts that TypeScript reproduces the
 * exact Solidity preimage for the single ClaimAttestation: typehash,
 * structHash, domain separator, and final digest.
 *
 * `ClaimAttestation` is the one Stage-2 attestation; it supersedes the old
 * BondAttestation + ReclaimAttestation. The `name` field is dynamic and is
 * hashed as `keccak256(bytes(name))` in the struct-hash preimage (NOT inlined
 * raw), per EIP-712 -- exactly as the contract encodes it.
 *
 * This is the off-chain signing compatibility guarantee. The manual
 * keccak256/abi.encode path proves byte-for-byte parity with the contract
 * preimage, while viem's hashTypedData path proves that a normal TypeScript
 * EIP-712 client produces the same durable digest vector.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  concatHex,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  stringToBytes,
  stringToHex,
} from "viem";

// ---------- JSON vector shape --------------------------------------------

type Hex = `0x${string}`;

interface DomainVector {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Hex;
  separator: Hex;
}

interface ClaimVector {
  identityHash: Hex;
  prngSeed: number;
  provider: string;
  providerHex32: Hex;
  name: string;
  nameHash: Hex;
  recipient: Hex;
  expiry: number | string;
  structHash: Hex;
  digest: Hex;
}

interface AttestationSection<TVector> {
  typeString: string;
  typehash: Hex;
  vectorCount: number;
  vectors: TVector[];
}

interface VectorFile {
  description: string;
  generatedBy: string;
  domain: DomainVector;
  claimAttestation: AttestationSection<ClaimVector>;
}

// Resolve path relative to the repo root. Bun's CWD is the repo root when
// tests run via `bun test` from the `plugin/` directory, so climb one level.
const VECTOR_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "onchain",
  "test",
  "vectors",
  "attestation-digest-vectors.json"
);

const raw = readFileSync(VECTOR_PATH, "utf8");
const vectorFile = JSON.parse(raw) as VectorFile;

// ---------- EIP-712 helpers -----------------------------------------------

const DOMAIN_TYPE_STRING =
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";

const CLAIM_TYPED_DATA_TYPES = {
  ClaimAttestation: [
    { name: "identityHash", type: "bytes32" },
    { name: "prngSeed", type: "uint32" },
    { name: "provider", type: "bytes16" },
    { name: "name", type: "string" },
    { name: "recipient", type: "address" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

const typedDataDomain = {
  name: vectorFile.domain.name,
  version: vectorFile.domain.version,
  chainId: vectorFile.domain.chainId,
  verifyingContract: vectorFile.domain.verifyingContract,
};

function uint(value: number | string): bigint {
  return BigInt(value);
}

function hashTypeString(typeString: string): Hex {
  return keccak256(stringToBytes(typeString));
}

function nameHash(name: string): Hex {
  return keccak256(stringToBytes(name));
}

function domainSeparator(domain: DomainVector): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        hashTypeString(DOMAIN_TYPE_STRING),
        keccak256(stringToBytes(domain.name)),
        keccak256(stringToBytes(domain.version)),
        uint(domain.chainId),
        domain.verifyingContract,
      ]
    )
  );
}

function digestFor(separator: Hex, structHash: Hex): Hex {
  return keccak256(concatHex(["0x1901", separator, structHash]));
}

function providerBytes16(vector: ClaimVector): Hex {
  expect(vector.providerHex32.length).toBe(66);

  const provider = `0x${vector.providerHex32.slice(2, 34)}` as Hex;
  const tail = vector.providerHex32.slice(34);

  expect(tail).toBe("0".repeat(32));
  expect(provider).toBe(stringToHex(vector.provider, { size: 16 }));

  return provider;
}

// The `name` field is dynamic: EIP-712 hashes it to a bytes32 before the
// struct-hash encode (`keccak256(bytes(name))`), NOT inlined as a raw string.
function claimStructHash(
  typehash: Hex,
  vector: ClaimVector,
  provider: Hex,
  hashedName: Hex
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "bytes16" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint64" },
      ],
      [
        typehash,
        vector.identityHash,
        vector.prngSeed,
        provider,
        hashedName,
        vector.recipient,
        uint(vector.expiry),
      ]
    )
  );
}

// ==========================================================================
// Tests
// ==========================================================================

describe("attestation digest parity vectors (shared with Foundry)", () => {
  test("loaded the expected vector file", () => {
    expect(vectorFile.description).toContain("EIP-712");
    expect(vectorFile.generatedBy).toBe(
      "onchain/script/GenerateAttestationVectors.s.sol"
    );

    expect(vectorFile.domain.name).toBe("BuddyNFT");
    expect(vectorFile.domain.version).toBe("1");
    expect(vectorFile.domain.chainId).toBe(84532);

    expect(vectorFile.claimAttestation.vectorCount).toBe(
      vectorFile.claimAttestation.vectors.length
    );
    expect(vectorFile.claimAttestation.vectorCount).toBeGreaterThan(0);
  });
});

describe("EIP-712 domain separator matches JSON vector", () => {
  test("domain object hashes to the pinned separator", () => {
    expect(domainSeparator(vectorFile.domain)).toBe(vectorFile.domain.separator);
  });
});

describe("ClaimAttestation EIP-712 preimages match JSON vectors", () => {
  const typehash = hashTypeString(vectorFile.claimAttestation.typeString);
  const separator = domainSeparator(vectorFile.domain);

  test("typeString hashes to the pinned typehash", () => {
    expect(typehash).toBe(vectorFile.claimAttestation.typehash);
  });

  for (const [index, vector] of vectorFile.claimAttestation.vectors.entries()) {
    test(`vector ${index}: provider, nameHash, structHash, digest, and hashTypedData match`, () => {
      const provider = providerBytes16(vector);
      const hashedName = nameHash(vector.name);
      const structHash = claimStructHash(
        typehash,
        vector,
        provider,
        hashedName
      );
      const digest = digestFor(separator, structHash);
      const typedDataDigest = hashTypedData({
        domain: typedDataDomain,
        primaryType: "ClaimAttestation",
        types: CLAIM_TYPED_DATA_TYPES,
        message: {
          identityHash: vector.identityHash,
          prngSeed: vector.prngSeed,
          provider,
          name: vector.name,
          recipient: vector.recipient,
          expiry: uint(vector.expiry),
        },
      });

      expect(hashedName).toBe(vector.nameHash);
      expect(structHash).toBe(vector.structHash);
      expect(digest).toBe(vector.digest);
      expect(typedDataDigest).toBe(vector.digest);
    });
  }
});

/**
 * Cross-domain EIP-712 attestation digest parity test.
 *
 * Reads the shared JSON vectors at
 * `onchain/test/vectors/attestation-digest-vectors.json` -- the same file the
 * Foundry test suite consumes -- and asserts that TypeScript reproduces the
 * exact Solidity preimage for BondAttestation and ReclaimAttestation:
 * typehash, structHash, domain separator, and final digest.
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

interface BondVector {
  tokenId: number | string;
  identityHash: Hex;
  prngSeed: number;
  recipient: Hex;
  expiry: number | string;
  structHash: Hex;
  digest: Hex;
}

interface ReclaimVector {
  tokenId: number | string;
  identityHash: Hex;
  prngSeed: number;
  provider: string;
  providerHex32: Hex;
  reclaimer: Hex;
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
  bondAttestation: AttestationSection<BondVector>;
  reclaimAttestation: AttestationSection<ReclaimVector>;
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

const BOND_TYPED_DATA_TYPES = {
  BondAttestation: [
    { name: "tokenId", type: "uint256" },
    { name: "identityHash", type: "bytes32" },
    { name: "prngSeed", type: "uint32" },
    { name: "recipient", type: "address" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

const RECLAIM_TYPED_DATA_TYPES = {
  ReclaimAttestation: [
    { name: "tokenId", type: "uint256" },
    { name: "identityHash", type: "bytes32" },
    { name: "prngSeed", type: "uint32" },
    { name: "provider", type: "bytes16" },
    { name: "reclaimer", type: "address" },
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

function bondStructHash(typehash: Hex, vector: BondVector): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "address" },
        { type: "uint64" },
      ],
      [
        typehash,
        uint(vector.tokenId),
        vector.identityHash,
        vector.prngSeed,
        vector.recipient,
        uint(vector.expiry),
      ]
    )
  );
}

function providerBytes16(vector: ReclaimVector): Hex {
  expect(vector.providerHex32.length).toBe(66);

  const provider = `0x${vector.providerHex32.slice(2, 34)}` as Hex;
  const tail = vector.providerHex32.slice(34);

  expect(tail).toBe("0".repeat(32));
  expect(provider).toBe(stringToHex(vector.provider, { size: 16 }));

  return provider;
}

function reclaimStructHash(
  typehash: Hex,
  vector: ReclaimVector,
  provider: Hex
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint32" },
        { type: "bytes16" },
        { type: "address" },
        { type: "uint64" },
      ],
      [
        typehash,
        uint(vector.tokenId),
        vector.identityHash,
        vector.prngSeed,
        provider,
        vector.reclaimer,
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

    expect(vectorFile.bondAttestation.vectorCount).toBe(
      vectorFile.bondAttestation.vectors.length
    );
    expect(vectorFile.reclaimAttestation.vectorCount).toBe(
      vectorFile.reclaimAttestation.vectors.length
    );
    expect(vectorFile.bondAttestation.vectorCount).toBeGreaterThan(0);
    expect(vectorFile.reclaimAttestation.vectorCount).toBeGreaterThan(0);
  });
});

describe("EIP-712 domain separator matches JSON vector", () => {
  test("domain object hashes to the pinned separator", () => {
    expect(domainSeparator(vectorFile.domain)).toBe(vectorFile.domain.separator);
  });
});

describe("BondAttestation EIP-712 preimages match JSON vectors", () => {
  const typehash = hashTypeString(vectorFile.bondAttestation.typeString);
  const separator = domainSeparator(vectorFile.domain);

  test("typeString hashes to the pinned typehash", () => {
    expect(typehash).toBe(vectorFile.bondAttestation.typehash);
  });

  for (const [index, vector] of vectorFile.bondAttestation.vectors.entries()) {
    test(`vector ${index}: structHash, digest, and hashTypedData match`, () => {
      const structHash = bondStructHash(typehash, vector);
      const digest = digestFor(separator, structHash);
      const typedDataDigest = hashTypedData({
        domain: typedDataDomain,
        primaryType: "BondAttestation",
        types: BOND_TYPED_DATA_TYPES,
        message: {
          tokenId: uint(vector.tokenId),
          identityHash: vector.identityHash,
          prngSeed: vector.prngSeed,
          recipient: vector.recipient,
          expiry: uint(vector.expiry),
        },
      });

      expect(structHash).toBe(vector.structHash);
      expect(digest).toBe(vector.digest);
      expect(typedDataDigest).toBe(vector.digest);
    });
  }
});

describe("ReclaimAttestation EIP-712 preimages match JSON vectors", () => {
  const typehash = hashTypeString(vectorFile.reclaimAttestation.typeString);
  const separator = domainSeparator(vectorFile.domain);

  test("typeString hashes to the pinned typehash", () => {
    expect(typehash).toBe(vectorFile.reclaimAttestation.typehash);
  });

  for (const [
    index,
    vector,
  ] of vectorFile.reclaimAttestation.vectors.entries()) {
    test(`vector ${index}: provider, structHash, digest, and hashTypedData match`, () => {
      const provider = providerBytes16(vector);
      const structHash = reclaimStructHash(typehash, vector, provider);
      const digest = digestFor(separator, structHash);
      const typedDataDigest = hashTypedData({
        domain: typedDataDomain,
        primaryType: "ReclaimAttestation",
        types: RECLAIM_TYPED_DATA_TYPES,
        message: {
          tokenId: uint(vector.tokenId),
          identityHash: vector.identityHash,
          prngSeed: vector.prngSeed,
          provider,
          reclaimer: vector.reclaimer,
          expiry: uint(vector.expiry),
        },
      });

      expect(structHash).toBe(vector.structHash);
      expect(digest).toBe(vector.digest);
      expect(typedDataDigest).toBe(vector.digest);
    });
  }
});

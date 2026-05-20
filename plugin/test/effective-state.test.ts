import { describe, expect, test } from "bun:test";
import { deriveEffective, type EffectiveReason } from "../src/effective-state";
import type {
  BuddyStateV4,
  HatchState,
  IdentityTuple,
  ModeLevel,
} from "../src/buddy-state";

const ID_A: IdentityTuple = {
  accountUuidHash: "a".repeat(64),
  chainId: 8453,
  contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

const ID_B: IdentityTuple = {
  accountUuidHash: "b".repeat(64),
  chainId: 8453,
  contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

const NULL_IDENTITY: IdentityTuple = {
  accountUuidHash: null,
  chainId: null,
  contractAddress: null,
};

interface Case {
  name: string;
  mode: ModeLevel;
  hatch: HatchState;
  identity: IdentityTuple;
  envOverride: ModeLevel | null;
  expected: { effectiveMode: ModeLevel; reason: EffectiveReason };
  stateIdentity?: IdentityTuple;
}

function stateFor(testCase: Case): BuddyStateV4 {
  const identity = testCase.stateIdentity ?? ID_A;

  return {
    schemaVersion: 4,
    mode: testCase.mode,
    hatch: testCase.hatch,
    tokenId: testCase.hatch === "warm" ? "0x1" : null,
    accountUuidHash: identity.accountUuidHash,
    chainId: identity.chainId,
    contractAddress: identity.contractAddress,
    turnCounter: 0,
    coldNudgeCounter: 0,
  };
}

const cases: Case[] = [
  // Identity match: effectiveMode echoes persisted mode; reason is ok.
  { name: "off + warm match -> off/ok", mode: "off", hatch: "warm", identity: ID_A, envOverride: null, expected: { effectiveMode: "off", reason: "ok" } },
  { name: "lite + warm match -> lite/ok", mode: "lite", hatch: "warm", identity: ID_A, envOverride: null, expected: { effectiveMode: "lite", reason: "ok" } },
  { name: "full + warm match -> full/ok", mode: "full", hatch: "warm", identity: ID_A, envOverride: null, expected: { effectiveMode: "full", reason: "ok" } },
  { name: "lite + cold match -> lite/ok", mode: "lite", hatch: "cold", identity: ID_A, envOverride: null, expected: { effectiveMode: "lite", reason: "ok" } },
  { name: "full + unknown match -> full/ok", mode: "full", hatch: "unknown", identity: ID_A, envOverride: null, expected: { effectiveMode: "full", reason: "ok" } },

  // Env override wins over persisted mode on identity match. Cases use
  // env != persisted so the assertion fails if the override path collapses
  // back to persisted.
  { name: "full state + env off -> off/ok", mode: "full", hatch: "warm", identity: ID_A, envOverride: "off", expected: { effectiveMode: "off", reason: "ok" } },
  { name: "off state + env full -> full/ok", mode: "off", hatch: "warm", identity: ID_A, envOverride: "full", expected: { effectiveMode: "full", reason: "ok" } },

  // Identity mismatch: reason flips, effectiveMode still passes through.
  { name: "full + warm + mismatch -> full/identity-mismatch", mode: "full", hatch: "warm", identity: ID_B, envOverride: null, expected: { effectiveMode: "full", reason: "identity-mismatch" } },
  { name: "off + warm + mismatch -> off/identity-mismatch", mode: "off", hatch: "warm", identity: ID_B, envOverride: null, expected: { effectiveMode: "off", reason: "identity-mismatch" } },
  { name: "lite + cold + mismatch -> lite/identity-mismatch", mode: "lite", hatch: "cold", identity: ID_B, envOverride: null, expected: { effectiveMode: "lite", reason: "identity-mismatch" } },
  { name: "full + unknown + mismatch -> full/identity-mismatch", mode: "full", hatch: "unknown", identity: ID_B, envOverride: null, expected: { effectiveMode: "full", reason: "identity-mismatch" } },
  { name: "env override + mismatch -> override/identity-mismatch", mode: "lite", hatch: "warm", identity: ID_B, envOverride: "full", expected: { effectiveMode: "full", reason: "identity-mismatch" } },

  // Fresh-install handoff: state has all-null identity, current identity is real.
  {
    name: "null state identity vs ID_A current -> identity-mismatch",
    mode: "full",
    hatch: "warm",
    identity: ID_A,
    envOverride: null,
    expected: { effectiveMode: "full", reason: "identity-mismatch" },
    stateIdentity: NULL_IDENTITY,
  },

  // Identity comparison checks every tuple field.
  { name: "accountUuidHash mismatch", mode: "lite", hatch: "warm", identity: { ...ID_A, accountUuidHash: ID_B.accountUuidHash }, envOverride: null, expected: { effectiveMode: "lite", reason: "identity-mismatch" } },
  { name: "chainId mismatch", mode: "lite", hatch: "warm", identity: { ...ID_A, chainId: 84532 }, envOverride: null, expected: { effectiveMode: "lite", reason: "identity-mismatch" } },
  { name: "contractAddress mismatch", mode: "lite", hatch: "warm", identity: { ...ID_A, contractAddress: ID_B.contractAddress }, envOverride: null, expected: { effectiveMode: "lite", reason: "identity-mismatch" } },

  // All-null identity tuple matches when state is also all-null.
  {
    name: "all-null on both sides -> ok",
    mode: "full",
    hatch: "warm",
    identity: NULL_IDENTITY,
    envOverride: null,
    expected: { effectiveMode: "full", reason: "ok" },
    stateIdentity: NULL_IDENTITY,
  },
];

describe("deriveEffective", () => {
  test.each(cases)("$name", (testCase: Case) => {
    const actual = deriveEffective(
      stateFor(testCase),
      testCase.identity,
      testCase.envOverride,
    );

    expect(actual).toEqual(testCase.expected);
  });
});

// site/test/unit/nonexistentTokenRevert.test.ts
//
// `isNonexistentTokenRevert` classifies the OZ ERC721NonexistentToken revert
// from tokenURI(missing id) as a deterministic miss, while every other
// failure (network, other custom errors, stripped revert data) stays a
// generic error. Building the revert via `encodeErrorResult` also proves the
// curated ABI carries the ERC721NonexistentToken entry — the errorName
// decode path depends on it.

import { describe, it, expect } from 'vitest';
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
} from 'viem';
import { BUDDY_NFT_ABI } from '~shared/buddyNftAbi';
import {
  ERC721_NONEXISTENT_TOKEN_SELECTOR,
  isNonexistentTokenRevert,
} from '../../src/lib/useBuddyLookup';

function encodedError(errorName: string, args: unknown[]): `0x${string}` {
  return encodeErrorResult({
    abi: BUDDY_NFT_ABI,
    errorName,
    args,
  } as Parameters<typeof encodeErrorResult>[0]);
}

function revertedPayload(data: `0x${string}`): ContractFunctionRevertedError {
  return new ContractFunctionRevertedError({
    abi: BUDDY_NFT_ABI,
    data,
    functionName: 'tokenURI',
  });
}

function revertedError(errorName: string, args: unknown[]): ContractFunctionRevertedError {
  return revertedPayload(encodedError(errorName, args));
}

function uppercaseHex(data: `0x${string}`): `0x${string}` {
  return `0x${data.slice(2).toUpperCase()}`;
}

function mixedCaseHex(data: `0x${string}`): `0x${string}` {
  const mixed = data
    .slice(2)
    .split('')
    .map((char, index) =>
      /[a-f]/i.test(char) && index % 2 === 1
        ? char.toUpperCase()
        : char.toLowerCase(),
    )
    .join('');
  return `0x${mixed}`;
}

describe('isNonexistentTokenRevert', () => {
  it('derives the ERC721NonexistentToken selector from the ABI signature', () => {
    expect(ERC721_NONEXISTENT_TOKEN_SELECTOR).toBe('0x7e273289');
  });

  it('classifies ERC721NonexistentToken wrapped in a viem error tree as miss', () => {
    const revert = revertedError('ERC721NonexistentToken', [42n]);
    const wrapped = new BaseError('execution reverted', { cause: revert });
    expect(isNonexistentTokenRevert(wrapped)).toBe(true);
  });

  it('classifies a bare ContractFunctionRevertedError as miss', () => {
    expect(
      isNonexistentTokenRevert(revertedError('ERC721NonexistentToken', [1n])),
    ).toBe(true);
  });

  it('classifies uppercase revert payloads via normalized signature fallback', () => {
    const revert = revertedPayload(
      uppercaseHex(encodedError('ERC721NonexistentToken', [42n])),
    );
    expect(revert.data?.errorName).toBeUndefined();
    expect(revert.signature).toBe('0x7E273289');
    expect(isNonexistentTokenRevert(revert)).toBe(true);
  });

  it('classifies mixed-case revert payloads via normalized raw fallback', () => {
    const revert = revertedPayload(
      mixedCaseHex(encodedError('ERC721NonexistentToken', [42n])),
    );
    expect(revert.data?.errorName).toBeUndefined();
    revert.signature = undefined;
    expect(isNonexistentTokenRevert(revert)).toBe(true);
  });

  it('rejects other contract custom errors', () => {
    expect(isNonexistentTokenRevert(revertedError('AlreadyHatched', []))).toBe(
      false,
    );
  });

  it('rejects plain network errors', () => {
    expect(isNonexistentTokenRevert(new Error('fetch failed'))).toBe(false);
  });

  it('rejects reverts with stripped data (no false miss)', () => {
    // RPCs that strip revert data leave nothing to classify — must stay a
    // generic error, never a miss.
    const stripped = new BaseError('execution reverted');
    expect(isNonexistentTokenRevert(stripped)).toBe(false);
  });
});

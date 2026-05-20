// React Query hook wrapping two sequential `publicClient.readContract` calls
// for a UUID → tokenId → tokenURI lookup. Powers `/view/<uuid>` without any
// wagmi dependency — the publicClient (`config/publicClient`) holds a
// hardcoded HTTP transport, so the hook works with no wallet connected.
//
// Tagged-union return shape:
//   { status: 'loading' }
//   { status: 'error', error: Error, kind: 'tokenId' | 'tokenUri' }
//   { status: 'success', data: BuddyData }
//
// `BuddyData.state` discriminates pre-deploy (no contract for the chain),
// miss (`getTokenIdByIdentity` returned 0), hit (tokenId > 0 and tokenURI
// decoded to SVG). Hit payload is SVG-only — metadata stays internal to the
// decoder; the on-chain SVG owns trait/stat chrome.
//
// Identity hash: `keccak256(toBytes(uuid))` matches the contract's
// `keccak256(bytes(accountUuid))` exactly. UUID is lowercased before
// hashing — the contract canonicalizes lowercase only.

import { useQuery } from '@tanstack/react-query';
import { keccak256, toBytes } from 'viem';
import { publicClient } from '../config/publicClient';
import { BUDDY_NFT_ABI } from '../config/contract';
import { getNetwork } from '../config/chains';
import { decodeTokenUriToSvg } from './decodeTokenUri';

// Discriminator for which on-chain read failed. `tokenId` failure means
// `getTokenIdByIdentity` threw (RPC down, malformed response, contract
// missing); `tokenUri` failure means tokenId resolved successfully but the
// follow-up `tokenURI(tokenId)` read threw.
type BuddyLookupErrorKind = 'tokenId' | 'tokenUri';

type BuddyLookupErrorState = {
  status: 'error';
  error: Error;
  kind: BuddyLookupErrorKind;
};

// Surfaced on success. `state` discriminates the three terminal branches
// the caller needs to render. Hit payloads expose only canonical SVG.
type BuddyData =
  | { state: 'pre-deploy' }
  | { state: 'miss' }
  | {
      state: 'hit';
      svg: string;
    };

type BuddyLookupResult =
  | { status: 'loading' }
  | BuddyLookupErrorState
  | { status: 'success'; data: BuddyData };

// Internal error wrapper carrying the discriminator. react-query throws
// raw errors back as `query.error`, so the hook's queryFn embeds the
// `kind` on a thrown subclass and the public layer re-shapes it.
class BuddyLookupError extends Error {
  readonly kind: BuddyLookupErrorKind;
  constructor(kind: BuddyLookupErrorKind, cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : `BuddyLookupError(${kind}): ${String(cause)}`,
    );
    this.name = 'BuddyLookupError';
    this.kind = kind;
    if (cause instanceof Error && cause.stack) this.stack = cause.stack;
  }
}

export function useBuddyLookup(
  uuid: string,
  chainId: number,
): BuddyLookupResult {
  // Error type stays as `Error` (the react-query default) so the
  // post-query `instanceof BuddyLookupError` narrow works correctly. TS
  // would over-narrow to `never` after the first instanceof check if we
  // typed the error as `BuddyLookupError` here.
  const query = useQuery<BuddyData, Error>({
    // Include chainId so misses/hits don't bleed across build-time networks.
    queryKey: ['buddy', chainId, uuid.toLowerCase()],
    queryFn: async (): Promise<BuddyData> => {
      const net = getNetwork(chainId);
      if (!net?.buddyNft) {
        return { state: 'pre-deploy' };
      }
      // Contract-mandated: lowercase before hashing.
      const identityHash = keccak256(toBytes(uuid.toLowerCase()));

      let tokenId: bigint;
      try {
        tokenId = (await publicClient.readContract({
          abi: BUDDY_NFT_ABI,
          address: net.buddyNft,
          functionName: 'getTokenIdByIdentity',
          args: [identityHash],
        })) as bigint;
      } catch (cause) {
        throw new BuddyLookupError('tokenId', cause);
      }

      // BuddyNFT token IDs start at 1; `0` is the canonical lookup-miss
      // sentinel.
      if (tokenId === 0n) {
        return { state: 'miss' };
      }

      let tokenUri: string;
      try {
        tokenUri = (await publicClient.readContract({
          abi: BUDDY_NFT_ABI,
          address: net.buddyNft,
          functionName: 'tokenURI',
          args: [tokenId],
        })) as string;
      } catch (cause) {
        throw new BuddyLookupError('tokenUri', cause);
      }

      // Decode SVG inside the queryFn so the caller renders synchronously
      // off the success state. Decoder shape errors (missing prefix, bad
      // base64, etc.) bubble as a `tokenUri`-kind error, treated identically
      // to an RPC failure from the caller's perspective.
      let svg: string;
      try {
        svg = decodeTokenUriToSvg(tokenUri);
      } catch (cause) {
        throw new BuddyLookupError('tokenUri', cause);
      }

      return { state: 'hit', svg };
    },
    // 30s for all states: miss/pre-deploy stale for 5min would strand a
    // freshly-hatched user on the wrong branch. Slight cache-miss cost on
    // hits is acceptable — buddy data is fetched once per page nav anyway.
    staleTime: 30_000,
    // One retry is plenty for a transient RPC blip; more would delay the
    // error-state render on a genuinely-down endpoint.
    retry: (failureCount) => failureCount < 2,
  });

  if (query.isPending) {
    return { status: 'loading' };
  }
  if (query.isError) {
    const err = query.error;
    if (err instanceof BuddyLookupError) {
      return { status: 'error', error: err, kind: err.kind };
    }
    // Unknown query errors are lookup failures by convention.
    return {
      status: 'error',
      error: err instanceof Error ? err : new Error(String(err)),
      kind: 'tokenId',
    };
  }
  // `isSuccess` — `query.data` is BuddyData.
  return { status: 'success', data: query.data as BuddyData };
}

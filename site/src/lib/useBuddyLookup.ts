// React Query hooks wrapping wallet-free public reads for `/view`.
//
// Split flow:
//   - manual `/view`: UUID stays in component state, resolves via
//     computeIdentityHash(uuid) → getTokenIdByIdentity, then navigates to the
//     canonical `/view/<tokenId>` URL on hit.
//   - token page `/view/:tokenId`: loads tokenURI(tokenId) directly and never
//     re-derives from UUID/hash.

import { useQuery } from '@tanstack/react-query';
import { computeIdentityHash } from '~shared/computeIdentityHash';
import { publicClient } from '../config/publicClient';
import { BUDDY_NFT_ABI } from '../config/contract';
import { getNetwork } from '../config/chains';
import { decodeTokenUriToSvg } from './decodeTokenUri';

type BuddyLookupErrorKind = 'tokenId' | 'tokenUri';

type BuddyLookupErrorState = {
  status: 'error';
  error: Error;
  kind: BuddyLookupErrorKind;
};

type BuddyLookupData =
  | { state: 'pre-deploy' }
  | { state: 'miss' }
  | { state: 'hit'; tokenId: bigint };

type BuddyTokenData =
  | { state: 'pre-deploy' }
  | { state: 'hit'; svg: string };

export type BuddyLookupResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | BuddyLookupErrorState
  | { status: 'success'; data: BuddyLookupData };

export type BuddyTokenResult =
  | { status: 'loading' }
  | BuddyLookupErrorState
  | { status: 'success'; data: BuddyTokenData };

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

function reshapeError(error: Error): BuddyLookupErrorState {
  if (error instanceof BuddyLookupError) {
    return { status: 'error', error, kind: error.kind };
  }
  return {
    status: 'error',
    error,
    kind: 'tokenId',
  };
}

export function useBuddyLookup(
  uuid: string | null,
  chainId: number,
): BuddyLookupResult {
  const canonicalUuid = uuid?.toLowerCase() ?? null;
  const query = useQuery<BuddyLookupData, Error>({
    queryKey: ['buddy-lookup', chainId, canonicalUuid],
    enabled: canonicalUuid !== null,
    queryFn: async (): Promise<BuddyLookupData> => {
      if (canonicalUuid === null) {
        throw new BuddyLookupError('tokenId', 'missing uuid');
      }
      const net = getNetwork(chainId);
      if (!net?.buddyNft) {
        return { state: 'pre-deploy' };
      }

      const identityHash = computeIdentityHash(canonicalUuid);

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

      if (tokenId === 0n) {
        return { state: 'miss' };
      }

      return { state: 'hit', tokenId };
    },
    staleTime: 30_000,
    retry: (failureCount) => failureCount < 2,
  });

  if (canonicalUuid === null) {
    return { status: 'idle' };
  }
  if (query.isPending) {
    return { status: 'loading' };
  }
  if (query.isError) {
    return reshapeError(query.error);
  }
  return { status: 'success', data: query.data as BuddyLookupData };
}

export function useBuddyToken(
  tokenId: bigint,
  chainId: number,
): BuddyTokenResult {
  const query = useQuery<BuddyTokenData, Error>({
    queryKey: ['buddy-token', chainId, tokenId.toString()],
    queryFn: async (): Promise<BuddyTokenData> => {
      const net = getNetwork(chainId);
      if (!net?.buddyNft) {
        return { state: 'pre-deploy' };
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

      try {
        return { state: 'hit', svg: decodeTokenUriToSvg(tokenUri) };
      } catch (cause) {
        throw new BuddyLookupError('tokenUri', cause);
      }
    },
    staleTime: 30_000,
    retry: (failureCount) => failureCount < 2,
  });

  if (query.isPending) {
    return { status: 'loading' };
  }
  if (query.isError) {
    return reshapeError(query.error);
  }
  return { status: 'success', data: query.data as BuddyTokenData };
}

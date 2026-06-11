// site/src/lib/parseTokenId.ts
//
// Token-id validity gate shared by the `/view/:tokenId` route parse and the
// miss-card retry prompt. Token ids are uint256 on-chain and start at 1;
// values past the ABI bound can never exist, so they fail validity
// (NotFound / inline error), not existence (miss card).

const MAX_UINT256 = (1n << 256n) - 1n;

export function parseTokenId(raw: string): bigint | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  const tokenId = BigInt(raw);
  return tokenId > 0n && tokenId <= MAX_UINT256 ? tokenId : null;
}

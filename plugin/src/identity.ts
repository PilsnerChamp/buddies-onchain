import type { IdentityTuple } from "./buddy-state";

export function sameIdentity(a: IdentityTuple, b: IdentityTuple): boolean {
  return (
    a.accountUuidHash === b.accountUuidHash &&
    a.chainId === b.chainId &&
    a.contractAddress === b.contractAddress
  );
}

export function identityIsUnset(identity: IdentityTuple): boolean {
  return (
    identity.accountUuidHash === null &&
    identity.chainId === null &&
    identity.contractAddress === null
  );
}

export function currentIdentityIsLessResolvedThanCache(
  cached: IdentityTuple,
  current: IdentityTuple,
): boolean {
  if (cached.accountUuidHash !== null && current.accountUuidHash === null) {
    return true;
  }
  if (cached.chainId !== null && current.chainId === null) {
    return true;
  }
  return cached.contractAddress !== null && current.contractAddress === null;
}

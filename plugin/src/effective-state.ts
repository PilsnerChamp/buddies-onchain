// Effective state derivation for buddy-onchain.
//
// Maps cached buddy state plus the current identity tuple to the effective
// mode other surfaces need, plus a reason flag for identity-mismatch
// (consumed by the ambient hook to silent-emit on stale identity).

import type {
  BuddyStateV4,
  IdentityTuple,
  ModeLevel,
} from "./buddy-state";
import { sameIdentity } from "./identity";

export type EffectiveReason = "identity-mismatch" | "ok";

export interface EffectiveState {
  effectiveMode: ModeLevel;
  reason: EffectiveReason;
}

export function deriveEffective(
  state: BuddyStateV4,
  identity: IdentityTuple,
  envOverride: ModeLevel | null,
): EffectiveState {
  return {
    effectiveMode: envOverride ?? state.mode,
    reason: sameIdentity(state, identity) ? "ok" : "identity-mismatch",
  };
}

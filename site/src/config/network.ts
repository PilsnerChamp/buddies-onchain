// site/src/config/network.ts
//
// Site-side selector for the build-time active network. Reads `VITE_CHAIN`
// (inlined by Vite at build time) and resolves to one of the three entries
// in `shared/networks.ts`. Exported as `ACTIVE_NETWORK` so call sites read
// `ACTIVE_NETWORK.chainId` / `.key` / `.rpcUrl` / `.displayName` without
// re-running the env-var → key → config lookup themselves.
//
// Callers that need contract address + status use `chains.ts::getNetwork(chainId)`,
// which merges this selector with the deployment loader (`deployment.ts`).
//
// `as NetworkKey` cast: `import.meta.env.VITE_CHAIN` is typed as `string |
// undefined` by Vite. The cast asserts the build-time invariant that the
// env var, when set, is one of the three keys. An invalid value throws a
// descriptive error at module load (rather than surfacing a cryptic
// TypeError on first property access) — canonical posture is "set the env
// var correctly at build time" (one of three deploy environments).
//
// Reference: docs/network-config.md § Three networks, § Selectors.

import {
  NETWORKS,
  type NetworkConfig,
  type NetworkKey,
} from '~shared/networks';

const VITE_CHAIN = (import.meta.env.VITE_CHAIN ?? 'local') as NetworkKey;
const _network = NETWORKS[VITE_CHAIN];
if (!_network) {
  throw new Error(
    `Invalid VITE_CHAIN: "${VITE_CHAIN}". Expected one of: ${Object.keys(NETWORKS).join(', ')}.`,
  );
}
export const ACTIVE_NETWORK: NetworkConfig = _network;

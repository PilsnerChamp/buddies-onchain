// site/src/config/publicClient.ts
//
// Hardcoded HTTP publicClient for the active build-time chain. Wallet-free
// reads — `/view` and `/view/<tokenId>` consume this client instead
// of the wagmi-coupled `useReadContract`, so the route no longer requires
// `<WagmiProvider>` in scope and no longer pulls the wagmi + RainbowKit
// chunk on cold load.
//
// Singleton export. The viem client is cheap to construct (no socket open
// until a request is made) but allocating it once keeps per-render call
// sites trivially identity-stable for react-query's `queryFn` closure.
//
// Reference: docs/network-config.md § publicClient.

import { createPublicClient, defineChain, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { ACTIVE_NETWORK } from './network';

// Anvil dev chain. Defined inline (not imported from `viem/chains`) for the
// same reason as `config/wagmi.ts`'s anvil definition: the canonical Anvil
// port is host-local and the `id` (31337) is what the site keys on. Mirrors
// the wagmi-side definition field-for-field — if one drifts, smoke fails.
const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

const chainForActive = (() => {
  switch (ACTIVE_NETWORK.key) {
    case 'local':
      return anvil;
    case 'sepolia':
      return baseSepolia;
    case 'mainnet':
      return base;
  }
})();

// Hardcoded `http()` transport — NO wallet RPC injection. The transport URL
// comes from `ACTIVE_NETWORK.rpcUrl` (sourced from `shared/networks.ts`),
// not from any wallet provider. This is the structural guarantee that
// `/view` and `/view/<tokenId>` work with no wallet connected.
export const publicClient = createPublicClient({
  chain: chainForActive,
  transport: http(ACTIVE_NETWORK.rpcUrl),
});

// wagmi v2 + RainbowKit v2 config. Consumed by `<WagmiProvider>` inside
// `layouts/HatchLayout.tsx`. Active chain is selected at build time from
// `ACTIVE_NETWORK` (`shared/networks.ts` via `config/network.ts`):
//   - VITE_CHAIN=local    → Anvil (31337)
//   - VITE_CHAIN=sepolia  → Base Sepolia (84532)
//   - VITE_CHAIN=mainnet  → Base mainnet (8453)
// Default `local`.
//
// RainbowKit `getDefaultConfig` ships the unmodified default wallet list
// (MetaMask, Coinbase Wallet, Rainbow, WalletConnect). No custom wallet
// tiles, no embedded wallet SDK.

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { ACTIVE_NETWORK } from './network';

// Anvil dev chain. Defined inline rather than imported from `viem/chains`
// because the canonical Anvil port (8545) is host-local and the `id` (31337)
// is what `chains.ts` keys on. `nativeCurrency` mirrors viem's `mainnet`
// shape so the wallet UX renders ETH amounts consistently.
const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
  testnet: true,
});

// Resolves `ACTIVE_NETWORK.key` to the wagmi chain tuple. The tuple is a
// non-empty readonly array because `getDefaultConfig` expects
// `[Chain, ...Chain[]]`.
function resolveChains(key: typeof ACTIVE_NETWORK.key) {
  switch (key) {
    case 'local':
      return [anvil] as const;
    case 'sepolia':
      return [baseSepolia] as const;
    case 'mainnet':
      return [base] as const;
  }
}

// WalletConnect Cloud project ID. Required by RainbowKit when WalletConnect
// is in the wallet list (which it is by default). A dev-acceptable value
// (the literal string `dev`) keeps the bundle from crashing during local
// `bun run dev` when the env var isn't set; production deploys must set
// `VITE_WALLETCONNECT_PROJECT_ID` to a real Cloud project ID for the
// WalletConnect modal to actually pair.
const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'dev';

// Local-dev override: RainbowKit's `getDefaultConfig` wraps MetaMask via
// `@metamask/sdk-react`, whose provider detection redirects to the extension
// onboarding page when EIP-6963 announcements compete (e.g. Coinbase Wallet
// also installed). For ACTIVE_NETWORK.key === 'local' we bypass the SDK
// entirely and use `injected({ target: 'metaMask' })` so the extension popup
// opens directly. Sepolia/mainnet keep the RainbowKit default wallet list.
export const wagmiConfig =
  ACTIVE_NETWORK.key === 'local'
    ? createConfig({
        chains: [anvil],
        connectors: [injected({ target: 'metaMask' })],
        transports: { [anvil.id]: http() },
        ssr: false,
        // Suppress EIP-6963 multi-wallet announcement collation. wagmi's
        // default (true) appends every announcing provider (Phantom, dual
        // MetaMask via SDK + extension, etc.) to the connector list, which
        // is the source of the duplicate-MetaMask entries even when only
        // one connector is explicitly configured. Local dev wants exactly
        // one path to MetaMask; production keeps RainbowKit defaults.
        multiInjectedProviderDiscovery: false,
      })
    : getDefaultConfig({
        appName: 'Buddies Onchain',
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: resolveChains(ACTIVE_NETWORK.key),
        // `ssr: false` — Vite SPA, no server render path. RainbowKit's default
        // assumes Next.js SSR; explicit `false` here documents the SPA stance
        // and skips the cookie-storage hydration shims.
        ssr: false,
      });

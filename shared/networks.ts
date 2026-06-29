// shared/networks.ts
//
// Single source of truth for STATIC network metadata. Per-deploy artifacts
// (contract addresses, deploy block) live in `onchain/deployments/<chainId>.json`.
// Each consumer merges those artifacts with this static map.
//
// Top-level `shared/` (sibling of `site/`, `plugin/`, `onchain/`) reflects
// the shared-by-design intent — neither consumer owns this file. Imported
// via the `~shared/*` tsconfig path alias from both site and plugin.
//
// Public reference: docs/network-config.md.

export type NetworkKey = 'local' | 'sepolia' | 'mainnet';

export interface NetworkConfig {
  key: NetworkKey;
  chainId: number;
  rpcUrl: string;                          // public, no API key
  explorerAddressBase: string | null;      // null for chains with no public explorer
  openseaItemBase: string | null;          // per-item base (append `<contract>/<tokenId>`); null = no OpenSea surface
  displayName: string;                     // lowercase; UI applies casing
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  local: {
    key: 'local',
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    explorerAddressBase: null,
    openseaItemBase: null,
    displayName: 'local',
  },
  sepolia: {
    key: 'sepolia',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    explorerAddressBase: 'https://sepolia.basescan.org/address/',
    openseaItemBase: null,                   // OpenSea sunset testnet support (2025-07-23) — no item URL
    displayName: 'base sepolia',
  },
  mainnet: {
    key: 'mainnet',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorerAddressBase: 'https://basescan.org/address/',
    openseaItemBase: 'https://opensea.io/item/base/',
    displayName: 'base',
  },
};

export const NETWORKS_BY_CHAIN_ID: Record<number, NetworkConfig> =
  Object.fromEntries(
    Object.values(NETWORKS).map((n) => [n.chainId, n]),
  );

# Network config

How the site and plugin pick a chain at build/runtime, and where chain metadata lives.

## Three networks

Static metadata: `shared/networks.ts`.

| Key | chainId | RPC URL | Explorer |
|---|---|---|---|
| `local` | 31337 | `http://127.0.0.1:8545` | none (Anvil) |
| `sepolia` | 84532 | `https://sepolia.base.org` | `https://sepolia.basescan.org/address/` |
| `mainnet` | 8453 | `https://mainnet.base.org` | `https://basescan.org/address/` |

`shared/networks.ts` is imported by both site and plugin via the `~shared/*` tsconfig path alias.

## Selectors

Each consumer reads its own env var.

| Consumer | Env var | Default | Read mechanism |
|---|---|---|---|
| site | `VITE_CHAIN` | `local` | `import.meta.env.VITE_CHAIN` (build-time inline) |
| plugin | `BUDDY_NETWORK` | `mainnet` | `process.env.BUDDY_NETWORK` (Bun runtime) |

Site defaults to `local` for dev. Plugin defaults to `mainnet` because the published distribution targets production.

Switch the site:

```bash
VITE_CHAIN=sepolia bun --cwd site run dev
VITE_CHAIN=mainnet bun --cwd site run build
```

Switch the plugin:

```bash
BUDDY_NETWORK=local bun plugin/src/index.ts --hook
BUDDY_NETWORK=sepolia bun plugin/src/index.ts --hook
```

Invalid value throws on first read with the list of accepted keys.

## Deployment manifests

Per-chain deploy artifacts live at `onchain/deployments/<chainId>.json`. The plugin vendors copies into `plugin/deployments/` via `bun run --cwd plugin sync-deployments` (called automatically by `bun run --cwd plugin build`).

Site reads `onchain/deployments/*.json` directly at Vite build/dev time. Plugin reads `plugin/deployments/<chainId>.json` lazily on first call to `getActiveNetwork()`.

Manifest shape and how it's produced: `docs/onchain/build.md`.

Address fields are optional. A pre-deploy manifest may omit `addresses` entirely; a partially populated manifest may omit individual contract keys. Read with `d?.addresses?.BuddyNFT` and treat absence as pre-deploy. When present, addresses ship EIP-55 checksummed — extraction writes them that way and tests assert exact case so lowercase regressions fail loudly.

Missing manifest for the active chain is soft — `getActiveNetwork()` returns `buddyNft: null` and consumers fall back to the cold/pre-deploy path. Filename-vs-payload chainId mismatch and malformed JSON throw.

### Hash-only hatch requires a fresh deploy

The hash-only `hatch(bytes32 identityHash, uint32 prngSeed)` signature changes the `hatch` function selector. Any manifest pointing at an older single-arg `hatch(bytes32)` (or the earlier `hatch(string)`) contract is incompatible — the site and plugin built against the new ABI will fail to hatch against it. The curated ABI in `shared/buddyNftAbi.ts` carries the two-arg `hatch`; both site and plugin import it. The `buddyPrngSeed(uint256)` view lives in the on-chain `IBuddyNFT` interface, not the curated subset — no client reads it. Ship a fresh contract deploy and a new `<chainId>.json` manifest before publishing the new site/plugin. ERC-165 interface ids and the `BondAttestation` EIP-712 typehash are unchanged, so wallet/marketplace interface detection is unaffected.

### Commit policy

Only canonical chains are committed. The root `.gitignore` is the enforcement source of truth and carries this policy as a comment.

| chainId | Network | Committed? | Why |
|---|---|---|---|
| `31337` | local Anvil | Yes — tracked | Deterministic Anvil address, same every fork run. Canonical for local dev at `onchain/deployments/31337.json`. |
| `84532` | Base Sepolia | No — gitignored | Validation network, redeployed on demand; only the address changes. |
| `8453` | Base mainnet | On deploy day | Canonical runtime pointer the shipped plugin and site resolve against. One permanent address. |

`84532.json` is gitignored in both `onchain/deployments/` and `plugin/deployments/`. `sync-deployments` still copies it into `plugin/deployments/` for local runs, but that copy is gitignored too — it never shows dirty and never ships.

## Active network accessors

- `site/src/config/chains.ts::getNetwork(chainId)` — merges static metadata with the deployment loader. Pre-deploy chains return `{ ...static, buddyNft: null, status: 'not-yet-deployed' }`.
- `plugin/src/network.ts::getActiveNetwork()` — same shape for the plugin. Returns `PluginNetworkInfo` with `buddyNft` and `deploymentBlock`.

Both expose `ACTIVE_NETWORK: NetworkConfig` for the static metadata of the selected key.

## ABI

`shared/buddyNftAbi.ts` holds a curated `BuddyNFT` ABI subset. Both site and plugin import it. One source of truth, no drift. `as const` is required for viem's type inference.

## publicClient

Both site and plugin construct a viem `publicClient` with a hardcoded `http(ACTIVE_NETWORK.rpcUrl)` transport. No wallet RPC injection. This is the structural guarantee that `/view/<tokenId>` and the plugin's cold/warm check work with no wallet connected.

- `site/src/config/publicClient.ts` — module-scope singleton.
- `plugin/src/publicClient.ts` — lazy singleton via `getPublicClient()`. Cold-account flows that short-circuit before any contract read never instantiate the client.

## Public RPC notes

`https://mainnet.base.org` and `https://sepolia.base.org` rate-limit aggressively. Acceptable for v1 traffic. Swap the URL in `shared/networks.ts` if you run into limits.

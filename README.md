# Buddies Onchain

> One account. One buddy. Lives on-chain. No host. No takedown.

A soulbound (non-transferable) identity artifact for developers who use AI coding tools. Hatch the specific companion your account was assigned and pin it to Base L2 as a permanent visual record. Born from the Claude Code terminal buddy.

## What it is

- Fully on-chain SVG. The renderer lives in contract bytecode; nothing is hosted off-chain.
- Deterministic trait derivation, backed by inspectable math. The plugin computes a seed from your account UUID client-side; the contract stores that seed and derives traits from it via Mulberry32. Same account, same buddy, every deployment.
- Consistency you can recompute. The traits on-chain provably match the stored seed — anyone can re-run the derivation and confirm `traits == _deriveTraits(seed)`. The raw UUID never crosses the wire; only the seed and an identity hash do. What the chain proves is that the traits follow from the seed, not that the seed came from any particular account — that link is established off-chain, and is what a later bonding stage attests.
- One account, one buddy. The token is bound to the identity hash; at the `Hatched` stage it is held by the contract, not in a wallet.
- The identity hash is the same on every deployment. It is derived only from your account, not from any chain, contract, or deployment. Binding it to a deployment would let a redeploy quietly change your buddy; the canonical record means nobody can.
- Two public stages: `Hatched` (the token sits at the contract address) and `Bonded` (dormant in v1).

Stage 1 (`Hatched`) is implemented; the contract ships pre-Sepolia at this commit. Mainnet address appears below once it lands on Base.

## What it isn't

- Not an NFT drop. No mint price. No royalties. No secondary market.
- Not a host. There is no API key, no centralized service, no takedown surface.
- Not a revival of the terminal companion. Buddies Onchain preserves a visual record.

## Naming

Short reference — full canonical table with usage rules at [`CLAUDE.md`](CLAUDE.md#naming).

| Name | What it is |
|---|---|
| `Buddies Onchain` | brand and collection name |
| `buddies-onchain` | slug — repo, org, domain, package, marketplace id |
| `BuddyNFT` | Solidity contract name. Technical surface only. |
| `buddy-onchain` | Claude Code plugin name |
| `/buddy-onchain` | the slash command you type in Claude Code |
| `/hatch` | the dApp route that mints the buddy for a UUID |
| `/view` | lookup console — one input takes a token id or an account UUID; UUIDs resolve to a tokenId client-side; `/view/<tokenId>` is the canonical buddy URL (no UUID in the path) |

## Use it

Plugin (inside Claude Code):

```
/plugin marketplace add PilsnerChamp/buddies-onchain
/plugin install buddy-onchain@buddies-onchain
```

Then in any session:

```
/buddy-onchain
```

Site: <https://buddies-onchain.xyz/>

Contract on Base mainnet: `<TBD post-deploy>` — this README updates when mainnet ships. Source at [`onchain/contracts/BuddyNFT.sol`](onchain/contracts/BuddyNFT.sol). The contract is source-verified on Basescan at deploy time.

Parity check (cross-domain trait derivation): see [`plugin/scripts/`](plugin/scripts/) and [`docs/onchain/derivation.md`](docs/onchain/derivation.md).

## Build and reference

Three modules. Per-module architecture and build steps live under `docs/`:

- Contract — [`docs/onchain/contract.md`](docs/onchain/contract.md), [`docs/onchain/build.md`](docs/onchain/build.md), [`docs/onchain/derivation.md`](docs/onchain/derivation.md)
- Plugin — [`docs/plugin/architecture.md`](docs/plugin/architecture.md)
- Site — [`docs/site/architecture.md`](docs/site/architecture.md)
- Network config (shared) — [`docs/network-config.md`](docs/network-config.md)

Issues and PRs welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Soulbound posture, maintainer-power scope, and disclosure: [`SECURITY.md`](SECURITY.md).

## License and contact

MIT. See [`LICENSE`](LICENSE). Embedded font attributions: [`NOTICE`](NOTICE).

Author: [@PilsnerChamp](https://x.com/PilsnerChamp). Repo: <https://github.com/PilsnerChamp/buddies-onchain>.

---

An unofficial community project, not endorsed by Anthropic.

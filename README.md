# Buddies Onchain

> One Claude account. One buddy. Lives on-chain. No host. No takedown.

A soulbound (non-transferable) identity artifact for Claude Code developers. Hatch the specific companion your Claude account was assigned and pin it to Base L2 as a permanent visual record.

## What it is

- Soulbound on-chain identity artifact. Non-transferable by design.
- Fully on-chain SVG. The renderer lives in contract bytecode; nothing is hosted off-chain.
- Deterministic trait derivation. UUID → wyhash → Mulberry32 → traits. Same input, same buddy, every time.
- One Claude account, one buddy. The token is held at the contract, bound to the account UUID — not to a wallet.
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
| `/view` | the dApp trust surface; `/view/<uuid>` is the canonical buddy URL |

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

## Quick links

- Public docs: [`docs/`](docs/)
- Plugin marketplace: <https://github.com/PilsnerChamp/buddies-onchain>
- Site: <https://buddies-onchain.xyz/>
- Contract on Basescan: `<TBD post-deploy>`

## Build and reference

Three modules. Per-module architecture and build steps live under `docs/`:

- Contract — [`docs/onchain/contract.md`](docs/onchain/contract.md), [`docs/onchain/build.md`](docs/onchain/build.md), [`docs/onchain/derivation.md`](docs/onchain/derivation.md)
- Plugin — [`docs/plugin/architecture.md`](docs/plugin/architecture.md)
- Site — [`docs/site/architecture.md`](docs/site/architecture.md)
- Network config (shared) — [`docs/network-config.md`](docs/network-config.md)

Solo-indie project. Issues welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Soulbound posture, maintainer-power scope, and disclosure: [`SECURITY.md`](SECURITY.md).

## License and contact

MIT. See [`LICENSE`](LICENSE). Embedded font attributions: [`NOTICE`](NOTICE).

Author: [@PilsnerChamp](https://x.com/PilsnerChamp). Repo: <https://github.com/PilsnerChamp/buddies-onchain>.

---

Buddies Onchain is an unofficial community project. It is not endorsed by, affiliated with, or sponsored by Anthropic.

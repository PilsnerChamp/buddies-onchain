# Build, test, deploy

Foundry workflow for the BuddyNFT contract suite.

## Prerequisites

- Foundry installed (`foundryup`).
- Bun (for parity scripts and the deployment-extract pipeline).
- Repo cloned. Working directory: `onchain/` for `forge` commands.

## Install dependencies

`onchain/lib/` is gitignored. There are no submodules. This step is the dependency source for a clean clone, so pin both deps to a release tag — floating versions drift bytecode and tests, breaking the "anyone can recompute" guarantee. Reinstall after every clean clone:

```bash
cd onchain
forge install --no-git foundry-rs/forge-std@v1.16.1
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.6.1
```

Pin to the release you build against, e.g. the tags above. The maintainer sets these to the exact versions the project builds and tests against — the contract targets solc 0.8.24 and OpenZeppelin Contracts v5.x (`onchain/foundry.toml`). Both commands are idempotent. Remappings live in `onchain/foundry.toml` — already set up for the installed paths.

## Build

```bash
cd onchain
forge build
```

Outputs `onchain/out/`. Compilation errors fail the command.

## Test

```bash
cd onchain
forge test            # runs everything
forge test -vv        # add traces
forge test --gas-report
forge test --match-contract 'BuddyNFTHatch'
```

Cross-domain parity tests run separately from the worktree root:

```bash
cd onchain && forge test --match-contract 'WyHash|Mulberry32'
bun --cwd plugin test mulberry32-parity
```

See `docs/onchain/derivation.md`.

## Deploy

`onchain/script/Deploy.s.sol` deploys the full contract suite (`BuddySpriteData`, `BuddyFont`, `BuddySpriteFont`, `BuddyRenderer`, `BuddyNFT`).

Required env:

- `PRIVATE_KEY` — deployer private key (no `0x` prefix). The local Anvil path in `deploy.sh` defaults this to anvil account #0 on chain `31337`; every other chain requires it set.

Chain selection is positional in `deploy.sh <rpc-url> [<chain-id>]` — when `<chain-id>` is omitted the script queries `cast chain-id --rpc-url <rpc-url>`. `Deploy.s.sol` itself reads only `block.chainid` (Foundry sets it from the RPC).

Mainnet guard: `Deploy.s.sol::validateDeploymentGuards()` reverts `AuthorAttestationSignerUnset` on chain id `8453` if `AuthorAttestation.SIGNER == address(0)`.

Local Anvil — `anvil` in one shell, then from the repo root in another:

```bash
bash onchain/tools/deploy/deploy.sh http://127.0.0.1:8545 31337
bash onchain/tools/seed/seed-anvil.sh
```

This deploys the contract suite and seeds sample buddies against the local chain.

Custom RPC:

```bash
cd onchain
PRIVATE_KEY=<key> forge script script/Deploy.s.sol:Deploy --rpc-url <url> --broadcast
```

## Deployment manifest

Post-deploy, `onchain/tools/deploy/extract-deployment.sh` parses `onchain/broadcast/Deploy.s.sol/<chainId>/run-latest.json` and writes a runtime manifest at `onchain/deployments/<chainId>.json`:

```json
{
  "chainId": 31337,
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "buddyNftBlock": 5,
  "addresses": {
    "BuddySpriteData": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "BuddyFont": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    "BuddySpriteFont": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    "BuddyRenderer": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    "BuddyNFT": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"
  }
}
```

Site reads this directly. Plugin vendors a copy at `plugin/deployments/<chainId>.json` via `bun run --cwd plugin sync-deployments`. The Anvil sample at `onchain/deployments/31337.json` is committed and canonical for local dev.

Loader semantics: missing file is soft (`buddyNft: null`, pre-deploy path); filename-vs-payload chainId mismatch and malformed JSON throw. See `docs/network-config.md`.

## Verify

After a clean clone:

```bash
cd onchain
forge install --no-git foundry-rs/forge-std@v1.16.1
forge install --no-git OpenZeppelin/openzeppelin-contracts@v5.6.1
forge build
forge test
```

Expected: zero errors, all tests pass.

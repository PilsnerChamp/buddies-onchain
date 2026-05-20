# Contributing

Solo-indie project. Issues welcome. PRs accepted; review on a best-effort basis.

MIT — contributions assumed under the same license. No CLA.

Build and run reference:

- `docs/onchain/build.md`
- `docs/plugin/architecture.md`
- `docs/site/architecture.md`

Cross-domain parity: the plugin and the on-chain SVG derive traits from the same UUID. If a change touches `plugin/src/bone-deriver.ts`, `onchain/contracts/libraries/WyHash.sol`, or `Mulberry32.sol`, read `docs/onchain/derivation.md` before opening the PR — drift breaks visual parity silently.

Security: see `SECURITY.md`.

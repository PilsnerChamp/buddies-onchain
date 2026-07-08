# Plugin architecture

Claude Code plugin that emits `/buddy-onchain` deep-links based on on-chain state at the user's identity hash. TS/Bun. Hook-only — no daemon, no server.

## Module topology

`plugin/src/`:

- `index.ts` — CLI entry. Parses `--session-start`, `--hook`, `--stop`, `--uuid <uuid>`. Reads stdin payload for hook mode. Outer try/catch; soft-fails to `{}`.
- `command-router.ts` — pure routing function. Maps a UserPromptSubmit prompt to one of `lookup` / `mutate` / `invalid` / `ambient`.
- `lookup.ts` — cold/warm decision. `resolveDeepLink(uuid)` returns `{ reason, tokenId }`. `siteOriginForKey(key)` returns the dApp origin — always the production origin, since the plugin is mainnet-only.
- `lookup-payload.ts` — formats the rendered deep-link block.
- `network.ts` — mainnet-only. Holds the vendored Base mainnet `NetworkConfig` (no `BUDDY_NETWORK`, no network selection) and merges it with `plugin/deployments/8453.json`. Lazy.
- `publicClient.ts` — viem `publicClient` over the Base mainnet RPC. Lazy singleton.
- `bone-deriver.ts` — TS-side trait derivation. `deriveTraitSeed(uuid) = wyhash(lowercase(uuid) + "friend-2026-401")` returns the `uint32` seed the contract stores. The `bytes32` identity hash comes from `computeIdentityHash`, not from here. The plugin computes both off the same UUID and emits both in the `/hatch` fragment, plus the fixed `provider=claude` label (`CLAUDE_PROVIDER` in `plugin/src/providerBytes16.ts`).
- `config-reader.ts` — reads `~/.claude.json`. Extracts `oauthAccount.accountUuid`.
- `isValidUuid.ts`, `assertCanonicalV4Uuid.ts`, `computeIdentityHash.ts`, `providerBytes16.ts`, `buddyNftAbi.ts` — **generated** vendored copies of the matching `shared/` modules. `shared/` is the source of truth; `bun run sync-shared` (part of `build`) regenerates these so the shipped `plugin/src/` is self-contained (no `~shared/*` alias, which does not resolve in an installer cache). Do not hand-edit — edit `shared/` and rebuild. Drift is caught by `plugin/test/vendored-shared-parity.test.ts` and `just plugin-check-dist`.
- `session-start.ts`, `stop-hook.ts`, `ambient.ts`, `sleeping-frame.ts`, `sprite-decorations.ts` — ambient-render pipeline.
- `buddy-state.ts`, `effective-state.ts`, `safe-json-store.ts`, `drift-flag.ts` — local state at `~/.claude/plugins/buddy-onchain/.buddy-state` (override base with `CLAUDE_CONFIG_DIR`).

## State-driven handoff

The hook fires on every UserPromptSubmit. The router's job is only to differentiate `/buddy-onchain` (and the legacy namespaced `/buddy-onchain:buddy-onchain`) from everything else.

For `/buddy-onchain` with no args:

1. `config-reader.ts` reads `~/.claude.json` and returns `accountUuid`.
2. `lookup.ts::resolveDeepLink(uuid)` decides cold vs warm:
   - `getActiveNetwork().buddyNft === null` → `cold-pre-deploy` (no RPC).
   - `publicClient.readContract({ functionName: 'getTokenIdByIdentity' })` throws → `cold-rpc-unavailable`.
   - `tokenId === 0n` → `cold-miss`.
   - `tokenId > 0n` → `warm-hatched`.
3. `lookup-payload.ts` formats the deep-link:
   - cold → `https://buddies-onchain.xyz/hatch#identityHash=0x<64 lowercase hex>&prngSeed=<decimal uint32>&provider=claude` (fragment, not query — the raw UUID never crosses the HTTP wire)
   - warm → `https://buddies-onchain.xyz/view/<tokenId>` (numeric; no UUID in the URL)
4. The hook emits `additionalContext` JSON. Claude Code injects it into the session.

The plugin computes the two derived hatch args off the UUID and emits them in the fragment, alongside the fixed `provider=claude` label. The dApp forwards all three to `hatch` verbatim — it never re-derives any. Identity hash: `computeIdentityHash` (`plugin/src/computeIdentityHash.ts`, vendored from `shared/`), `keccak256("buddies-onchain:identity:claude:v1" || 0x1f || lowercase(uuid))`, also passed to `getTokenIdByIdentity` for the warm/cold check. Trait seed: `bone-deriver.ts::deriveTraitSeed(uuid)`. Provider: `CLAUDE_PROVIDER` from `plugin/src/providerBytes16.ts`. UUID is `trim().toLowerCase()` before both derivations. Only a UUID that passes v4 validation (`assertCanonicalV4Uuid`) is used — never a fallback or placeholder. These primitives are vendored copies of the `shared/` originals (self-contained `plugin/src/`), drift-guarded by `plugin/test/vendored-shared-parity.test.ts`. Site origin: always `https://buddies-onchain.xyz` (the plugin is mainnet-only).

## Cross-domain parity

The plugin re-derives traits off-chain for sleeping-frame rendering. Two parity points must hold byte-for-byte against the contract.

| Domain | TS source | Solidity source |
|---|---|---|
| wyhash | `bone-deriver.ts::wyhash` | `onchain/contracts/libraries/WyHash.sol` (primitive parity only; `hatch` does not call it — the client supplies the seed) |
| Mulberry32 | `bone-deriver.ts::makeMulberry32` | `onchain/contracts/libraries/Mulberry32.sol` |

The seed step (`wyhash`) is client-side on the mint path — the contract stores the seed and never recomputes it. WyHash parity stays guarded against `WyHash.t.sol` so the plugin's seed matches what any client would compute.

Vector fixtures: `onchain/test/vectors/{wyhash,mulberry32}-vectors.json`. Generators: `plugin/scripts/generate-{wyhash,mulberry32}-vectors.ts`. Plugin parity test: `plugin/test/mulberry32-parity.test.ts`. See `docs/onchain/derivation.md`.

## CLI surface

```bash
node plugin/dist/index.js --session-start
node plugin/dist/index.js --hook         # reads UserPromptSubmit JSON on stdin
node plugin/dist/index.js --stop
node plugin/dist/index.js --hook --uuid <uuid>   # dev-only ambient override
```

`--uuid` is a developer override for hook ambient rendering and is not exposed by the marketplace plugin.

## Marketplace install

Install commands and end-user behavior live in [`plugin/README.md`](../../plugin/README.md). Manifest path: `plugin/.claude-plugin/plugin.json`. Skill: `plugin/skills/buddy-onchain/SKILL.md`. Slash command file: `plugin/commands/buddy-onchain.md`. Hooks: `plugin/hooks/`.

## Bundle reproducibility

`plugin/dist/index.js` is tracked. Marketplace install consumes it directly with no build step on the user's machine. Rebuild with:

```bash
bun run --cwd plugin build
```

The `build` script runs three steps in order: `sync-deployments` copies `onchain/deployments/*.json` into `plugin/deployments/`; `sync-shared` regenerates the vendored `plugin/src/*` copies from `shared/` (see Module topology); then `bun build src/index.ts --target=node --outfile=dist/index.js` bundles. All three write tracked artifacts, so a fresh build must leave the tree clean — `just plugin-check-dist` rebuilds and fails if `plugin/dist`, `plugin/deployments`, or any vendored `plugin/src` copy drifts from what is committed. CI verifies the rebuild produces an unchanged bundle.

See `docs/network-config.md` for the env-var and deployment-manifest contract.

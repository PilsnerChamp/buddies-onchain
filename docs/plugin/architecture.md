# Plugin architecture

Claude Code plugin that emits `/buddy-onchain` deep-links based on on-chain state at the user's identity hash. TS/Bun. Hook-only — no daemon, no server.

## Module topology

`plugin/src/`:

- `index.ts` — CLI entry. Parses `--session-start`, `--hook`, `--stop`, `--uuid <uuid>`. Reads stdin payload for hook mode. Outer try/catch; soft-fails to `{}`.
- `command-router.ts` — pure routing function. Maps a UserPromptSubmit prompt to one of `lookup` / `mutate` / `invalid` / `ambient`.
- `lookup.ts` — cold/warm decision. `resolveDeepLink(uuid)` returns `{ reason, tokenId }`. `siteOriginForKey(key)` gates the dApp origin on network key.
- `lookup-payload.ts` — formats the rendered deep-link block.
- `network.ts` — reads `BUDDY_NETWORK` and merges `shared/networks.ts` with `plugin/deployments/<chainId>.json`. Lazy.
- `publicClient.ts` — viem `publicClient` over the active network's RPC. Lazy singleton.
- `bone-deriver.ts` — TS-side trait derivation. `deriveTraitSeed(uuid) = wyhash(lowercase(uuid) + "friend-2026-401")` returns the `uint32` seed the contract stores. The `bytes32` identity hash comes from the shared `computeIdentityHash`, not from here. The plugin computes both off the same UUID and emits both in the `/hatch` fragment.
- `config-reader.ts` — reads `~/.claude.json`. Extracts `oauthAccount.accountUuid`.
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
   - cold → `https://buddies-onchain.xyz/hatch#identityHash=0x<64 lowercase hex>&prngSeed=<decimal uint32>` (fragment, not query — the raw UUID never crosses the HTTP wire)
   - warm → `https://buddies-onchain.xyz/view/<tokenId>` (numeric; no UUID in the URL)
4. The hook emits `additionalContext` JSON. Claude Code injects it into the session.

The plugin computes both hatch args off the UUID and emits them in the fragment. The dApp forwards them to `hatch` verbatim — it never re-derives either. Identity hash: shared `computeIdentityHash` (`shared/computeIdentityHash.ts`), `keccak256("buddies-onchain:identity:claude:v1" || 0x1f || lowercase(uuid))`, also passed to `getTokenIdByIdentity` for the warm/cold check. Trait seed: `bone-deriver.ts::deriveTraitSeed(uuid)`. UUID is `trim().toLowerCase()` before both derivations. Only a UUID that passes shared v4 validation (`assertCanonicalV4Uuid`) is used — never a fallback or placeholder. Site origin: `local` → `http://localhost:5173`; everything else → `https://buddies-onchain.xyz`.

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
bun run plugin/src/index.ts --session-start
bun run plugin/src/index.ts --hook         # reads UserPromptSubmit JSON on stdin
bun run plugin/src/index.ts --stop
bun run plugin/src/index.ts --hook --uuid <uuid>   # dev-only ambient override
```

`--uuid` is a developer override for hook ambient rendering and is not exposed by the marketplace plugin.

## Marketplace install

Install commands and end-user behavior live in [`plugin/README.md`](../../plugin/README.md). Manifest path: `plugin/.claude-plugin/plugin.json`. Skill: `plugin/skills/buddy-onchain/SKILL.md`. Slash command file: `plugin/commands/buddy-onchain.md`. Hooks: `plugin/hooks/`.

## Bundle reproducibility

`plugin/dist/index.js` is tracked. Marketplace install consumes it directly with no build step on the user's machine. Rebuild with:

```bash
bun run --cwd plugin build
```

The `build` script syncs `onchain/deployments/*.json` into `plugin/deployments/` first, then runs `bun build src/index.ts --target=bun --outfile=dist/index.js`. CI verifies the rebuild produces an unchanged bundle.

See `docs/network-config.md` for the env-var and deployment-manifest contract.

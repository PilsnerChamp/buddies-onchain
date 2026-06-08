# Ambient buddy presence

Quiet, deterministic buddy presence in Claude Code. The plugin emits a sprite-only block at a configurable cadence and degrades silently when state or cached art is missing. Lookup/slash rendering lives in `docs/plugin/architecture.md`; this doc owns the ambient surface, its cache, and the RPC discipline that keeps prompt turns cheap.

## RPC discipline

Ambient turns read local files only and never touch the chain. The hook fires on every `UserPromptSubmit`; per-prompt RPC would tax public endpoints and add latency to the prompt path.

Live RPC happens on two paths:

- **`SessionStart`** — once per Claude Code session. Resolves identity, refreshes chain-facing state with `getTokenIdByIdentity`, and writes `.buddy-state`. It intentionally does **not** fetch `tokenURI` and does not populate the art cache.
- **`/buddy-onchain`** — every slash invocation. Resolves identity and chain state; when warm, fetches `tokenURI` once and derives both the rendered slash card and `.buddy-art-cache.json` frames from that single payload.

Ambient turns read only persisted state and art cache. Cache missing, stale, malformed, oversized, symlinked, or identity-mismatched → emit `{}` (no injection). No fallback RPC.

## Hook surface

`plugin/.claude-plugin/plugin.json` registers three hooks:

| Hook | Entry | Timeout |
|---|---|---|
| `SessionStart` | `bun "${CLAUDE_PLUGIN_ROOT}/dist/index.js" --session-start` | 5s |
| `UserPromptSubmit` | `bun "${CLAUDE_PLUGIN_ROOT}/dist/index.js" --hook` | 10s |
| `Stop` | `bun "${CLAUDE_PLUGIN_ROOT}/dist/index.js" --stop` | 5s |

`SessionStart` emits either `OK` or the active ambient ruleset. `UserPromptSubmit` and `Stop` emit hook JSON and fail closed to `{}`; hook stderr/exit codes must not pollute the user's prompt path.

### Stdin contract

The `--hook` entry reads JSON on stdin. Malformed payloads, TTY input (no stdin pipe), or empty pipes emit `{}` immediately and exit. The hook does not fall through to the ambient/RPC branch on bad stdin — that would trigger unintended work. `turnCounter` is not bumped because there was no real `UserPromptSubmit` to count.

The `--stop` entry also reads stdin, then checks whether the last assistant response rendered the expected buddy block. Missing or malformed input still emits `{}`. Drift-flag writes are best effort.

## Injection contracts

`SessionStart` emits one fat active ruleset for both `full` and `lite` modes. `UserPromptSubmit` emits a thin trigger that includes a `DISPLAY_BUDDY` anchor and the sprite payload when the cadence gate fires.

### `SessionStart` raw stdout — active ambient ruleset

Lives in `plugin/src/instructions.ts::RULESET_AMBIENT`. Emitted whenever the effective mode is `full` or `lite`, independent of whether the latest chain writer resolved warm, cold, or unknown. Cadence is the only difference between `full` and `lite`. Effective `off` emits `OK`; `BUDDY_MODE=off` short-circuits before config, state, or RPC work.

The ruleset instructs the assistant to render the buddy block **only** when the literal `DISPLAY_BUDDY` token appears in context for the current turn, immediately followed by a fenced code block. Anchor absent → silent turn.

Block shape: triple-backtick fenced code (no language tag), two-column `sprite | joke` layout. Sprite is copied verbatim from the per-turn `DISPLAY_BUDDY` block — never substituted from memory or prior turns. Joke is self-critical, on-current-prompt, ≤ 20 words.

### Statusline nudge

`plugin/src/instructions.ts::STATUSLINE_NUDGE_TEMPLATE(absolutePath)` appends to `SessionStart` output only when `settings.json.statusLine` is missing. The template carries an absolute path resolved at injection time (no `${CLAUDE_PLUGIN_ROOT}` literal — that does not interpolate at statusline runtime). The user is prompted to add a `statusLine` entry pointing at the bundled `buddy-statusline.sh`.

The statusline badge itself reads `[<eyes>:<mode>]` — `@,@` for warm, `-,-` for cold/unknown; mode is `off`, `lite`, or `full` after `BUDDY_MODE` override.

## Art cache

The art cache is the bridge between warm slash RPC and ambient turns. SessionStart updates `.buddy-state` only; it does not populate this cache.

### Shape

```ts
interface BuddyArtCacheV1 {
  schemaVersion: 1;
  accountUuidHash: string;
  chainId: number;
  contractAddress: string;
  tokenId: string;
  frames: Record<string, string[]>;   // frameId -> sprite rows
  cachedAtMs: number;
}
```

`frames` carries the parsed sprite groups (`f0`, `f1`, `f2`, `fb`) extracted from the on-chain SVG.

### Storage

Path: `~/.claude/plugins/buddy-onchain/.buddy-art-cache.json` (override base with `CLAUDE_CONFIG_DIR`).

Safety rules — any breach kills the cache and ambient renders nothing:

- Symlink refused (`safeReadJson` / `safeWriteJson`).
- File size > 32 KiB rejected.
- Unknown keys rejected.
- Schema version mismatch rejected.
- Identity tuple mismatch (different account UUID hash, chainId, contract address, or tokenId) → ambient returns `{}`.

### Writers

- `/buddy-onchain` (slash) — on a warm online lookup, fetches `tokenURI` once, extracts card lines and ambient frames from the same SVG, and writes the cache atomically.
- Identity reset or verified cold state clears stale art cache.

### Readers

- `UserPromptSubmit` cadence gate — on eligible warm turns, reads the cache, validates identity + token match, rotates frames (`f0 → f1 → f2 → fb`), and emits `additionalContext` with the `DISPLAY_BUDDY` block and sprite payload. Cache miss / invalid → `{}`.

## Cadence

`plugin/src/buddy-state.ts::derivedEveryNth(mode)` returns the every-N-prompts cadence:

| mode | cadence |
|---|---|
| `full` | every prompt (N=1) |
| `lite` | every 3rd prompt (N=3) |
| `off` | never (`Number.POSITIVE_INFINITY`) |

`turnCounter` is zero-based — the first eligible `UserPromptSubmit` always emits, then every Nth thereafter.

Default mode is `full`; users may persist `off`, `lite`, or `full` through the slash command.

## Environment overrides

```text
BUDDY_MODE=off|lite|full          # overrides persisted mode
BUDDY_NETWORK=local|sepolia|mainnet  # see docs/network-config.md
```

Env wins over persisted state. When env differs from persisted, slash status output prepends a notice line so the UI doesn't lie. See `docs/network-config.md` for the network env contract.

## Identity coupling

The state file, art cache, and ambient render all key on `(accountUuidHash, chainId, contractAddress)`, and art cache also keys on `tokenId`. If any identity leg changes (account switch, network swap, redeploy), SessionStart updates `.buddy-state`, stale art is cleared or ignored, and the ambient surface goes silent until a warm slash lookup refreshes frames.

`accountUuidHash = sha256(lowercased uuid)` for state-file keying. On-chain identity hash is the shared `computeIdentityHash` (`shared/computeIdentityHash.ts`), `keccak256("buddies-onchain:identity:claude:v1" || 0x1f || lowercase(uuid))`; the two are distinct on purpose — the file-key hash avoids leaking the on-chain hash on disk.

## File map

- Hook entry: `plugin/src/index.ts`
- Injection rulesets + statusline template: `plugin/src/instructions.ts`
- Art cache reader/writer: `plugin/src/art-cache.ts`
- State machine: `plugin/src/buddy-state.ts`, `plugin/src/effective-state.ts`
- SVG → frame extraction: `plugin/src/sleeping-frame.ts`, `plugin/src/sprite-decorations.ts`
- SessionStart pipeline: `plugin/src/session-start.ts`
- Slash lookup payload and art-cache population: `plugin/src/lookup-payload.ts`
- Stop-hook drift detection: `plugin/src/stop-hook.ts`
- Statusline scripts: `plugin/hooks/buddy-statusline.{sh,ps1}`

See `docs/plugin/architecture.md` for the slash router and cold/warm decision, and `docs/network-config.md` for env + deployment manifest contracts.

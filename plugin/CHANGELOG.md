# Changelog

## v1.2.0 — Heartbeat-only badge detection (2026-07-18)

### Changed

- Badge-wiring detection is heartbeat-only: the SessionStart nudge no longer probes `settings.json` for a `statusLine` key (a key proves nothing — project-level settings can shadow it, and a foreign statusline satisfies the probe without rendering the badge). SessionStart now nudges only when neither the per-project nor the global badge heartbeat exists; the nudge copy tells the model to offer compose snippets instead of replacing an existing custom statusline.
- Badge heartbeat is per-project: `buddy-statusline.{sh,ps1}` touch `projects/<key>/.badge-heartbeat` (key = first 16 hex chars of sha256 of `workspace.project_dir` from statusline stdin) in addition to the global `.badge-heartbeat`. `/buddy-onchain`'s wire hint checks the per-project file only, so a badge rendering in another open session no longer masks a project whose own `.claude/settings.json` statusline shadows the badge.
- Heartbeat detection is existence-based, not mtime-based: statusline renders are event-driven, so a stale mtime only proves an idle gap — the old 10-minute freshness window would have false-nagged after any lull. Only a never-created heartbeat (or a symlinked/non-regular one the scripts refuse to touch) counts as a miss. Trade-off: unwiring a once-wired statusline is not re-nagged; deleting the plugin state files resets detection.
- `buddy-statusline.ps1` reads stdin as raw bytes and decodes UTF-8 explicitly — `[Console]::In` decodes with the legacy console code page under Windows PowerShell 5.1, which mangled non-ASCII project paths into a key the plugin reader could never match.
- Custom-statusline embeds (hooks/README.md Option 1/2) must forward the statusline stdin JSON (and close the pipe) / touch the per-project heartbeat to stay detected — snippets updated, including the full `sha256sum`/`shasum`/`openssl` fallback chain (macOS has no `sha256sum`); an old embed keeps the global heartbeat alive (no SessionStart nag) but the slash card will show the wire hint until recomposed.

## v1.1.0 — Warm art cache self-heal (2026-07-18)

### Changed

- A warm buddy whose ambient art cache is missing or identity/token-mismatched (e.g. cleared by account rotation) now rebuilds it during SessionStart with one bounded tokenURI fetch, instead of degrading silently until the next warm slash lookup. The fetch is bounded at the process level: a scoped viem client carries an AbortController signal (headers and body) with `retryCount 0`, aborted ahead of the 2s sub-budget inside the 5s hook timeout, with an unref'd race timer as backstop — an abandoned in-flight request would otherwise pin the event loop past the hook budget and lose the emitted ruleset.

## v1.0.1 — Quiet degradation without Node (2026-07-09)

### Changed

- Manifest hooks return to `sh -c` dispatch, now with per-hook quiet fallbacks when `node` is missing from `PATH` (previously exec form surfaced a spawn-failure error on every hook event): `SessionStart` emits a single dormant notice into session context, `UserPromptSubmit` emits `{}`, `Stop` exits 0. Node present → `exec node "$0" "$@"` hands off transparently, stdin included. Tradeoff reversal of v1.0.0: native Windows hooks again require `sh` on `PATH` (Git Bash); Linux, macOS, and WSL2 unaffected.
- `/buddy-onchain` no-render fallback is now diagnostic: when the session shows the dormant notice or `node`-not-found hook errors, the command points at installing Node.js ≥18 instead of suggesting a retry that cannot succeed.

## v1.0.0 — Mainnet-only publish cut (2026-07-08)

### Breaking

- Plugin runtime narrows to Base mainnet only (chainId 8453). The `BUDDY_NETWORK` env var is removed entirely — the plugin knows one chain, so there is no network selection or override. The `local`/`sepolia` runtime branches (chain dispatch in `publicClient`, site-origin gating) are gone; the site keeps the broader multi-network config for testnet staging.

### Changed

- `src/` is now self-contained: the `~shared/*` runtime imports (`isValidUuid`, `assertCanonicalV4Uuid`, `computeIdentityHash`, `providerBytes16`, `buddyNftAbi`, and the mainnet network constants) are vendored into `plugin/src/` so the git-tracked source that ships to installer caches has zero imports reaching outside `plugin/`. Keep the vendored copies in sync with `shared/`.
- `plugin.json` gains `"license": "MIT"`; author identity is now `PilsnerChamp` (`https://buddies-onchain.xyz`), matching the marketplace `owner`.
- Manifest hooks switch from POSIX `sh` one-liners (with a `command -v node` guard) to exec form (`"command": "node"` + `args`): Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` itself and spawns `node` directly, no shell involved, so hooks dispatch identically on Linux, macOS, and native Windows (including PowerShell-fallback hosts without Git Bash). The guard's "install Node" fallback message is gone — a missing `node` now surfaces as a non-blocking hook spawn failure; the Node ≥18 requirement stays documented in the README. Exec form sets a host floor: Claude Code ≥ 2.1.139 (where the hook `args` field landed) — on older versions the hooks do not run and the buddy simply doesn't appear.

## v0.4.4 — Statusline badge heartbeat (2026-07-03)

### Added

- Badge heartbeat: `buddy-statusline.{sh,ps1}` touch `<CLAUDE_CONFIG_DIR>/plugins/buddy-onchain/.badge-heartbeat` on every render (best-effort, symlink-guarded). Fresh mtime = the badge participates in the live status bar.
- `/buddy-onchain` lookup now detects a badge that silently stopped rendering — no statusline, foreign statusline, or a project-level `.claude/settings.json` shadowing the user-level entry — and appends a `statusline:` warning with the wiring hint. Certain misses only (missing/stale/symlinked heartbeat, lstat-checked); fs uncertainty stays silent.
- `hooks/README.md` inline-embed snippet (Option 2) gained the heartbeat touch line — inline composers keep it to stay detected.

### Changed

- `statuslineScriptPath()` moved from `session-start.ts` to `plugin-paths.ts` (shared by the SessionStart nudge and the lookup wire hint).
- `LookupPayload` gained `statuslineWireHint: string | null`.

## v0.4.3 — Cadence-only mode axis (2026-05-02)

### Breaking

- Default mode flipped back to `full`. Affects fresh installs and missing-state boots only — persisted preference is preserved on load.
- `lite` now renders the same sprite + joke column as `full` — cadence is the only axis of differentiation (full=every prompt, lite=every 3rd, off=never).
- Single `RULESET_AMBIENT` constant; `RULESET_AMBIENT_LITE` / `RULESET_AMBIENT_FULL` removed. `buildAdditionalContext` no longer takes a `level` parameter.

### Changed

- Slash decision module collapsed from 6 to 3 cells; `chainStatus` no longer changes slash message or URL; card richness stays owned by `formatLookupBlock`.
  - Card source: warm-offline reads art-cache, no RPC retry; `sleepingFrame` fallback; warm path only goes card-empty on atlas miss.

### Migration

Users who set `lite` under v0.4.2 (or had it as the v0.4.2 default) keep `lite`. Their buddy now appears with the joke column on every 3rd prompt — same cadence as before, new layout. To restore the v0.4.2 sprite-only feel, the path is `/buddy-onchain off` (silent) or accept the new layout. There is no sprite-only mode in v0.4.3.

## v0.4.2 — Mode-axis completion (2026-05-01)

### Breaking

- `mode=full` cadence now means every user prompt (was every 3rd).
- New default mode is `lite`. Existing persisted `mode=full` preserved on load — no silent downgrade.
- Statusline badge shape: `[<eyes>:<mode>]` two-axis instead of single token.
- Slash output: `verbs: off|lite|full` line replaced with self-describing mode + cadence + change hint.

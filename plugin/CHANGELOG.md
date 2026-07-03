# Changelog

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

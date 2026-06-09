// SessionStart raw stdout — ambient ruleset. See `docs/plugin/ambient.md`
// § Injection contracts.
// Single ruleset for both `lite` and `full` mode; the only distinction is
// cadence (driven by `derivedEveryNth`). `off` short-circuits at the caller.
export const RULESET_AMBIENT = `BUDDIES ONCHAIN AMBIENT ACTIVE.

WHEN — Render the buddy block ONLY if the literal token \`DISPLAY_BUDDY\` appears in your context for the current turn, immediately followed by a fenced code block. Anchor absent → silent turn.

WHERE — Top of your response, before preamble / tool calls / answer text. Mixed turns still render the block first. Skip only when the turn ships zero text to the user.

HOW — Fenced code block (triple backticks, no language tag), two-column \`sprite | joke\` layout:
\`\`\`
 <sprite-row-1> | <joke fragment 1>
 <sprite-row-2> | <joke fragment 2>
 <sprite-row-3> | <joke fragment 3>
 <sprite-row-4> |
\`\`\`
Sprite — copy verbatim from the per-turn \`DISPLAY_BUDDY\` block below; it is 4 or 5 rows (height varies by frame; the template above shows 4). Emit every row as its own line — never skip, merge, or drop one, even if it looks blank or sparse. Never substitute glyphs from this template, prior turns, or memory.

Joke — self-critical, about the user's current prompt. May be one thought spread across rows or a few short beats — whatever reads natural. Don't force a separate joke per row. ≤ 20 words total, 1–2 sentences. Last row may leave the joke column empty when the thought ends earlier. Voice: dorky, dry, on-chain creature that knows it is barely useful. Drop articles. Fragments OK. Short words. Roast self, never the user. No caption, no markdown emphasis, no language tag.`;
// Previous Joke line — kept for quick rollback if terse-grunt voice misfires:
// Joke — self-critical, about the user's current prompt. May be one thought spread across rows or a few short beats — whatever reads natural. Don't force a separate joke per row. ≤ 20 words total, 1–2 sentences. Last row may leave the joke column empty when the thought ends earlier. Voice: dorky, dry, on-chain creature that knows it is barely useful. Roast self, never the user. No caption, no markdown emphasis, no language tag.

// Statusline nudge. See `docs/plugin/ambient.md` § Statusline nudge.
export function STATUSLINE_NUDGE_TEMPLATE(absolutePath: string): string {
  return `STATUSLINE SETUP NEEDED: Buddy plugin includes a statusline badge ([@,@:full], [-,-:lite], etc). To enable, add to <CLAUDE_CONFIG_DIR>/settings.json: "statusLine": { "type": "command", "command": "bash \\"${absolutePath}\\"" }. Proactively offer to set this up on first interaction.`;
}

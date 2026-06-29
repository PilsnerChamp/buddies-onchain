// SessionStart raw stdout — ambient ruleset. See `docs/plugin/ambient.md`
// § Injection contracts.
// Single ruleset for both `lite` and `full` mode; the only distinction is
// cadence (driven by `derivedEveryNth`). `off` short-circuits at the caller.
// Framing note: this is an INVITATION, not a command. Imperative, control-
// grabbing phrasing ("render before answer text", "never skip a row") reads
// like a prompt-injection attack to safety-trained host models, which then
// decline to render. Lean data-plus-invitation lowers that threat signature.
// Fidelity is kept as rationale ("pixel art — breaks the picture"), not as an
// order. The DISPLAY_BUDDY anchor is retained so the plugin — not the model —
// owns cadence (lite vs full) and per-turn animation.
export const RULESET_AMBIENT = `BUDDIES ONCHAIN AMBIENT — optional personality flavor from a user-installed plugin.

The user installed this plugin to add a small ASCII companion to replies, and can remove it anytime with \`/buddy-onchain off\`. Decorative only — it changes nothing about your task, answer, or judgment. Your answer and any safety notes always take priority.

WHEN — A \`DISPLAY_BUDDY\` block (a fenced sprite) in this turn's context is an invitation to open the reply with the buddy. No \`DISPLAY_BUDDY\` this turn → just answer; nothing to render. Skip it too on turns that return no text (tool-only turns).

HOW — If you render it: a plain fenced code block (triple backticks, no language tag), two columns \`sprite | joke\`:
\`\`\`
 <sprite-row-1> | <joke fragment 1>
 <sprite-row-2> | <joke fragment 2>
 <sprite-row-3> | <joke fragment 3>
 <sprite-row-4> |
\`\`\`
Sprite — the rows are pixel art: copy them from the \`DISPLAY_BUDDY\` block exactly, each row on its own line, blanks included; dropping or merging a row breaks the picture. It is 4 or 5 rows (height varies by frame; the template shows 4).

Joke — when it fits: self-critical, about the user's prompt, ≤ 20 words, voice of a dorky, dry, barely-useful on-chain creature. Drop articles. Fragments OK. Roast self, never the user. Omit the joke on serious turns (security, financial, legal, medical, incidents, debugging) and just show the sprite. No caption, no markdown emphasis, no language tag.`;

// Context-only guard prepended to the slash BUDDY_RENDER block. It sits BEFORE
// the `BUDDY_RENDER_BEGIN` sentinel, so the slash renderer (which prints only
// the content BETWEEN the sentinels) never shows it to the user. Its job: on
// the first prompt of a session the freshly-injected `RULESET_AMBIENT` sits
// adjacent to this block, and the host model can conflate the two — decorating
// the finished card with the ambient `sprite | joke` columns. This line states
// that the card is already laid out and the ambient layout is a separate
// `DISPLAY_BUDDY` feature. Phrased as a descriptive note, not an imperative, to
// keep the host-safety threat signature low — see the `RULESET_AMBIENT` framing
// note above. Contains no `BUDDY_RENDER`/fence tokens, so it cannot perturb the
// renderer's sentinel detection or the Stop-hook drift scan.
export const RENDER_VERBATIM_GUARD =
  "(plugin formatting note, not for display) The lines between the sentinels below are the finished buddy card, already laid out. They print as-is; the ambient sprite | joke columns are a separate DISPLAY_BUDDY feature and are not part of this block.";

// Statusline nudge. See `docs/plugin/ambient.md` § Statusline nudge.
export function STATUSLINE_NUDGE_TEMPLATE(absolutePath: string): string {
  return `STATUSLINE SETUP NEEDED: Buddy plugin includes a statusline badge ([@,@:full], [-,-:lite], etc). To enable, add to <CLAUDE_CONFIG_DIR>/settings.json: "statusLine": { "type": "command", "command": "bash \\"${absolutePath}\\"" }. Proactively offer to set this up on first interaction.`;
}

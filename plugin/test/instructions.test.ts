import { describe, expect, test } from "bun:test";

import {
  RULESET_AMBIENT,
  STATUSLINE_NUDGE_TEMPLATE,
} from "../src/instructions";

const EXPECTED_AMBIENT = `BUDDIES ONCHAIN AMBIENT ACTIVE.

WHEN — Render the buddy block ONLY if the literal token \`DISPLAY_BUDDY\` appears in your context for the current turn, immediately followed by a fenced code block. Anchor absent → silent turn.

WHERE — Top of your response, before preamble / tool calls / answer text. Mixed turns still render the block first. Skip only when the turn ships zero text to the user.

HOW — Fenced code block (triple backticks, no language tag), two-column \`sprite | joke\` layout:
\`\`\`
 <sprite-row-1> | <joke fragment 1>
 <sprite-row-2> | <joke fragment 2>
 <sprite-row-3> | <joke fragment 3>
 <sprite-row-4> |
\`\`\`
Sprite — copy verbatim from the per-turn \`DISPLAY_BUDDY\` block below. Never substitute glyphs from this template, prior turns, or memory.

Joke — self-critical, about the user's current prompt. May be one thought spread across rows or a few short beats — whatever reads natural. Don't force a separate joke per row. ≤ 20 words total, 1–2 sentences. Last row may leave the joke column empty when the thought ends earlier. Voice: dorky, dry, on-chain creature that knows it is barely useful. Drop articles. Fragments OK. Short words. Roast self, never the user. No caption, no markdown emphasis, no language tag.`;

function approximateTokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("instructions rulesets — token guardrails", () => {
  test("ambient ruleset stays below the SessionStart token budget", () => {
    expect(approximateTokenCount(RULESET_AMBIENT)).toBeLessThanOrEqual(250);
  });
});

describe("instructions rulesets — contract text", () => {
  test("ambient ruleset is state-neutral and exact", () => {
    expect(RULESET_AMBIENT).toBe(EXPECTED_AMBIENT);
    expect(RULESET_AMBIENT).toContain("DISPLAY_BUDDY");
    expect(RULESET_AMBIENT).not.toContain("your buddy is on-chain");
    expect(RULESET_AMBIENT).not.toContain("warm only");
  });
});

describe("STATUSLINE_NUDGE_TEMPLATE", () => {
  test("injects the resolved statusline script path inline", () => {
    const nudge = STATUSLINE_NUDGE_TEMPLATE("/abs/path/buddy-statusline.sh");
    const pluginRootPlaceholder = "${CLAUDE_" + "PLUGIN_ROOT}";

    expect(nudge).toContain("/abs/path/buddy-statusline.sh");
    expect(nudge).toContain("statusLine");
    expect(nudge).toContain(String.raw`bash \"/abs/path/buddy-statusline.sh\"`);
    expect(nudge).not.toContain(pluginRootPlaceholder);
  });
});

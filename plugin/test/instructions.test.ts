import { describe, expect, test } from "bun:test";

import {
  RULESET_AMBIENT,
  STATUSLINE_NUDGE_TEMPLATE,
} from "../src/instructions";

const EXPECTED_AMBIENT = `BUDDIES ONCHAIN AMBIENT — optional personality flavor from a user-installed plugin.

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

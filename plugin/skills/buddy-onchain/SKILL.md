---
name: buddy-onchain
description: >
  Render the merged Buddies Onchain command surface. Slash-only trigger:
  `/buddy-onchain` checks chain state and shows hatch/view guidance;
  `/buddy-onchain off`, `/buddy-onchain lite`, and `/buddy-onchain full`
  set ambient mode plugin-wide. The hook owns lookup, state writes, and
  all user-facing block text.
---

The UserPromptSubmit hook pre-renders a single block as
`additionalContext`. The block is bracketed by `BUDDY_RENDER_BEGIN`
and `BUDDY_RENDER_END` sentinels.

Print everything between the sentinels verbatim. Strip the sentinel
lines themselves. Preserve fenced code blocks exactly — spaces, glyphs,
and line breaks are meaningful.

Do not call tools. Do not retry lookup. Do not mutate state yourself.
The hook is the only writer for buddy state.

If no `BUDDY_RENDER_BEGIN` block is in context, print exactly:

```
buddy lookup unavailable — try again
```

Then stop.

## Command surface

| Slash form | Hook behavior |
|---|---|
| `/buddy-onchain` | Live chain check, then render view/hatch/status guidance. |
| `/buddy-onchain off` | Disable ambient mode. |
| `/buddy-onchain lite` | Sprite + joke column, every 3rd prompt. |
| `/buddy-onchain full` | Sprite + joke column, every prompt (default). |

There is no natural-language routing. If the user asks through prose,
tell them to type the slash command themselves so the hook fires.

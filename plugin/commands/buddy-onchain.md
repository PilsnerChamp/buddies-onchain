---
description: Find or tune your onchain buddy.
argument-hint: "[off|lite|full]"
---

The buddy-onchain plugin already attached the complete response to
your context as a block bracketed by `BUDDY_RENDER_BEGIN` and
`BUDDY_RENDER_END`.

Print the exact content between those two sentinels verbatim. Strip
the sentinel lines themselves — they are markers, not user-facing text.

Preserve every character in fenced code blocks. Do not add markdown
links, extra punctuation, commentary, follow-up questions, or tool
calls.

If no `BUDDY_RENDER_BEGIN` block was injected, print:

```
buddy lookup unavailable - try again
```

Then stop.

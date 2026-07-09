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

If no `BUDDY_RENDER_BEGIN` block was injected, the plugin runtime did
not run. Check the session context: if it contains a buddy-onchain
dormant notice, or hook errors like `Executable not found in $PATH:
"node"` or `Executable not found in $PATH: "sh"`, the cause is a
missing runtime dependency — print:

```
buddy runtime needs Node.js >=18 and sh on PATH - install Node (and Git Bash on native Windows, or use WSL2), then start a new session
```

Otherwise print:

```
buddy lookup unavailable - try again
```

Then stop. Do not add commentary in either case.

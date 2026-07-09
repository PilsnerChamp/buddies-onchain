One account. One buddy. Lives on-chain. No host. No takedown.

Run `/buddy-onchain` when you want to find your buddy.

If your buddy is waiting to be hatched, you get one link to hatch.
If your buddy is already onchain, you get one link to view.

## Install

```
claude plugin marketplace add PilsnerChamp/buddies-onchain
claude plugin install buddy-onchain@buddies-onchain
```

Verify with `claude plugin list`; remove with `claude plugin remove buddy-onchain`. If `marketplace add` stalls or reports the marketplace not found on the first fetch, run the add command again.

Requires [Node.js](https://nodejs.org) 18 or newer and `sh` on your `PATH` (Git Bash provides `sh` on native Windows), and Claude Code 2.1.139 or newer (the manifest hooks pass an `args` array, added in that release).

## Ambient mode

A small sprite appears at the top of your responses. Pre-hatch it sleeps; post-hatch it shows your buddy. Tune it with `/buddy-onchain [off|lite|full]`:

| Command | Effect |
|---|---|
| `/buddy-onchain` | Check chain state and show the current mode |
| `/buddy-onchain off` | Turn the ambient sprite off |
| `/buddy-onchain lite` | Sprite + joke column, every 3rd prompt |
| `/buddy-onchain full` | Sprite + joke column, every prompt (default) |

The setting persists across sessions in `~/.claude/plugins/buddy-onchain/.buddy-state`.

## Notes

- The plugin reads Base mainnet (chain id 8453) — lookups only. It never asks you to sign anything; hatching happens on the dApp, in your own wallet.
- The install ships this directory wholesale, source and tests included; `dist/index.js` is what runs.
- Hooks dispatch through `sh`, which guards for `node` before running the plugin. If Node.js (>=18) isn't on your `PATH`, the hooks stay quiet — no errors on your prompts — and `/buddy-onchain` tells you to install Node and start a new session. On native Windows the hooks need `sh` on `PATH` (Git Bash provides it).

Site: <https://buddies-onchain.xyz>. Source: <https://github.com/PilsnerChamp/buddies-onchain>.

An unofficial community project, not endorsed by Anthropic.

One Claude account. One buddy. Lives on-chain. No host. No takedown.

Run `/buddy-onchain` when you want to find your buddy.

If your buddy is waiting to be hatched, you get one link to hatch.
If your buddy is already onchain, you get one link to view.

## Ambient mode

A small sprite appears at the top of your responses — passive ambient surface between turns. Pre-hatch it sleeps; post-hatch it shows your buddy. Tune it with `/buddy-onchain [off|lite|full]` plugin-wide:

| Command | Effect |
|---|---|
| `/buddy-onchain` | Check chain state and show the current mode |
| `/buddy-onchain off` | Disable ambient injection |
| `/buddy-onchain lite` | Sprite + joke column, every 3rd prompt |
| `/buddy-onchain full` | Sprite + joke column, every prompt (default) |

Setting persists across sessions in `~/.claude/plugins/buddy-onchain/.buddy-state`.

## Install

```
/plugin marketplace add PilsnerChamp/buddies-onchain
/plugin install buddy-onchain@buddies-onchain
```

Requires [Bun](https://bun.sh) 1.1.0 or newer on your `PATH`.

https://buddies-onchain.xyz

Buddies Onchain is an unofficial community project. It is not endorsed by, affiliated with, or sponsored by Anthropic.

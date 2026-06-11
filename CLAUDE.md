# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Buddies Onchain

Buddies Onchain is an on-chain identity-record project. One account, one buddy: a contract-custodied token bound to the account UUID. Born from the Claude Code terminal buddy; provider-agnostic by design. The art is a fully on-chain SVG rendered from contract bytecode, with deterministic traits derived from the UUID. The public surfaces target Base L2: contract, plugin, and static dApp.

## Repo layout

- `onchain/` — Foundry contracts, renderer libraries, deployment scripts, fixtures, and contract data.
- `plugin/` — Claude Code `/buddy-onchain` plugin source, bundle, marketplace manifest, command, hooks, tests, and deployment manifests.
- `site/` — Vite/React static dApp for `/`, `/hatch`, `/view`, `/view/<tokenId>`, and `/bond`.
- `shared/` — TypeScript shared by the plugin and site: network metadata, curated ABI, and deployment loading helpers.
- `docs/` — Public technical reference for build, config, contract shape, plugin topology, and site topology.

## Naming

Confusion-prone. One line each.

- `Buddies Onchain` — brand / collection name (plural, capitalized); also the ERC-721 `name()` value
- `Buddy Onchain #N` — per-token instance label in ERC-721 metadata `name` (what wallets and marketplaces show)
- `buddies-onchain` — slug (plural, kebab); repo, org, domain, package, handles, plugin marketplace id
- `buddy-onchain` — plugin name (singular) as published in the Claude Code plugin marketplace
- `/buddy-onchain` — plugin command string; what users type in Claude Code to find their buddy. Slash-only — hook fires lookup on the slash form (and the legacy namespaced `/buddy-onchain:buddy-onchain`); no NL routing. Companion skill at `plugin/skills/buddy-onchain/SKILL.md` is the slash renderer.
- `BuddyNFT` — Solidity contract / class / file name; technical surface only
- `/hatch` — two referents: (1) landing-page conceit in `NEXT STEPS` (never runnable); (2) dApp route receiving the hatch handoff via fragment `#identityHash=<hash>&prngSeed=<seed>&provider=<provider>`. Plugin derives the two args client-side and emits the fragment with the `provider` label (raw UUID never enters the URL); dApp parses and synchronously scrubs the fragment on arrival. Missing/malformed → redirect to `/`.
- `/view` — bare `/view` is the dApp lookup console; accepts a token id or an account UUID (shape-detected), resolves client-side, then navigates to `/view/<tokenId>`. The `/view/<tokenId>` miss state renders the same console.
- `/view/<tokenId>` — canonical buddy URL on the dApp; returning-user destination and public lookup result. Plugin resolves identityHash → tokenId and emits this warm link. (`/view/<uuid>` removed — route deleted, no public uuid links exist. UUID survives only in dApp component state — never in the fragment, a path, or a query string.)
- `> /buddy-onchain` — SVG chrome imprint on-chain; bytecode-permanent, matches the plugin command. Site's `/` prompt renders the same `>` sigil.
- `provider` — self-declared `bytes16` label for the originating AI coding tool, set at `hatch` and stored verbatim (`claude` for v1). One contract, one collection, shared across providers; the chain attests the label stays consistent, not that it is true. Domain tag carries the slug: `buddies-onchain:identity:<provider>:v1`.
- Unknown paths → `/` via catch-all redirect.

Commands and URLs are declarative. They state what they do; no defensive copy or branded wrappers on user-facing surfaces.

## Working environment

Run Foundry commands from `onchain/`. Run repo, plugin, site, shared, and docs commands from the repo root unless a module doc says otherwise.

Required tooling: Bun, Foundry, and a Node-compatible environment. Install Foundry dependencies into `onchain/lib/` with `forge install --no-git foundry-rs/forge-std` and `forge install --no-git OpenZeppelin/openzeppelin-contracts`.

Module build/run references: `docs/onchain/build.md`, `docs/plugin/architecture.md`, `docs/site/architecture.md`.

## Contribution conventions

- Code-first: prefer self-documenting names and inline comments. Do not add standalone docs without maintainer approval.
- Fix-first: trivial fixable issues are fixed in place, not documented as warnings or TODOs.
- Public technical docs follow the contribution conventions in `CONTRIBUTING.md`.

## Product docs

| Surface | Start here |
|---|---|
| Network config | `docs/network-config.md` — env vars, network selection, deployment manifests |
| Contract | `docs/onchain/{build,contract,derivation,renderer}.md` — Foundry build, BuddyNFT shape, trait derivation, on-chain SVG renderer |
| Plugin | `docs/plugin/{architecture,ambient}.md` — plugin module topology, ambient buddy presence + cache discipline |
| Site | `docs/site/{architecture,terminal-ui}.md` — dApp routes/topology, terminal UI contract |

## License and project files

MIT — see `LICENSE`. Buddies Onchain is an unofficial community project.

The short-form disclaimer lives in exactly three homes: `README.md`, `plugin/README.md`, and the contractURI description. This file is not a disclaimer home and does not restate it.

Other reference files: `NOTICE` (third-party font attributions only — not the disclaimer), `SECURITY.md`, `CONTRIBUTING.md`.

/**
 * Buddies Onchain Plugin — CLI entry point.
 *
 * Supported runtime surface is hook-only:
 *   - `--session-start` refreshes persisted buddy state and emits SessionStart rules.
 *   - `--hook` routes UserPromptSubmit slash, mutation, invalid, and ambient turns.
 *   - `--stop` scans the last assistant message and marks ambient drift.
 *   - `--uuid <uuid>` is a developer-only override for hook ambient rendering.
 *
 * The plugin runtime targets exactly one chain — Base mainnet — with no
 * network selection or env override. See `plugin/src/network.ts`.
 *
 * Usage:
 *   node plugin/dist/index.js --session-start
 *   node plugin/dist/index.js --hook
 *   node plugin/dist/index.js --stop
 *   node plugin/dist/index.js --hook --uuid <id>        # dev-only ambient override
 *
 * Reference: docs/network-config.md;
 * CLAUDE.md (plugin component description).
 */

import { isValidUuid } from "./isValidUuid";
import { readClaudeConfig, extractIdentity } from "./config-reader";
import { getActiveNetwork } from "./network";
import { buildAdditionalContext, renderAmbientFrame } from "./ambient";
import { sleepingFrame } from "./sleeping-frame";
import { applyColdNudge, applySleepIndicator } from "./sprite-decorations";
import { routePrompt } from "./command-router";
import {
  defaultState,
  derivedEveryNth,
  getEnvMode,
  mutateState,
  readIdentityTuple,
  readState,
  type BuddyStateV4,
} from "./buddy-state";
import { deriveEffective } from "./effective-state";
import {
  formatLookupBlock,
  formatInvalidVerbBlock,
  resolveLookupPayload,
} from "./lookup-payload";
import { runSessionStart } from "./session-start";
import { RULESET_AMBIENT } from "./instructions";
import {
  clearDriftFlag,
  consumeExpectedRender,
  consumeSessionFresh,
  isDriftFlagSet,
  setExpectedRender,
} from "./drift-flag";
import { runStopHook } from "./stop-hook";

// ---------- CLI argument parsing -------------------------------------------

interface CliArgs {
  hook: boolean;
  sessionStart: boolean;
  stop: boolean;
  uuid: string | null;
  invalidArgs: string[];
  missingValueFor: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    hook: false,
    sessionStart: false,
    stop: false,
    uuid: null,
    invalidArgs: [],
    missingValueFor: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--hook") {
      // `--hook` is canonical (referenced by the manifest's `hooks` block).
      // It routes to runHook — the orchestrator that handles all prompts
      // (lookup / mutate / invalid / ambient) via the command-router.
      args.hook = true;
    } else if (arg === "--session-start") {
      args.sessionStart = true;
    } else if (arg === "--stop") {
      args.stop = true;
    } else if (arg === "--uuid") {
      if (i + 1 < argv.length) {
        args.uuid = argv[++i];
      } else {
        args.missingValueFor = "--uuid";
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node plugin/dist/index.js [options]

Options:
  --hook                UserPromptSubmit hook mode: routes /buddy-onchain
                        and ambient prompts. Emits hook JSON or '{}'
                        on soft-fail.
  --session-start       SessionStart hook mode: refreshes buddy state and
                        emits the branched ambient ruleset or OK.
  --stop                Stop hook mode: scans last assistant message for
                        buddy block; sets drift flag if missing.
  --uuid <uuid>         Developer override for hook ambient rendering; not
                        used by the marketplace plugin.
  --help, -h            Show this help message

The plugin reads on-chain state from Base mainnet only.
`);
      process.exit(0);
    } else {
      args.invalidArgs.push(arg);
    }
  }

  return args;
}

// ---------- hook mode -------------------------------------------------------
//
// One UserPromptSubmit handler routes the merged command surface:
//
//   /buddy-onchain                  → live lookup + render block
//   /buddy-onchain <off|lite|full>  → local mode write (no RPC)
//   /buddy-onchain <garbage>        → render verb help
//   anything else                   → cached-state ambient cadence
//
// Hard contract: this mode NEVER fails the user's prompt. Every nested
// call already soft-fails, every code path emits valid JSON to stdout,
// `process.exit` is forbidden inside the hook reach, and the outer
// try/catch is the last line of defense.

/**
 * UserPromptSubmit hook input shape Claude Code pipes on stdin. Only
 * `prompt` is consumed by the router; other fields are kept on the
 * type for forward-compat clarity.
 */
interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  prompt?: string;
  session_title?: string;
}

/**
 * Read and parse the JSON payload Claude Code pipes on stdin. Bounded
 * by `timeoutMs` so a missing pipe (test harness, manual invocation)
 * never hangs the hook past its `hooks.json` timeout.
 *
 * Returns:
 *   - `null` on parse failure / TTY (no real hook payload available) —
 *     caller MUST emit `{}` and exit; no routing inference from a
 *     malformed payload because that can land on `ambient` and trigger
 *     a real RPC + sprite injection on a corrupted invocation.
 *   - The parsed `HookInput` otherwise. An empty-prompt parsed payload
 *     (`{}` after `JSON.parse`) routes to `ambient` deliberately — Claude
 *     Code may legitimately fire the hook on prompts the harness clears
 *     before our process sees them.
 */
async function readHookInput(timeoutMs = 200): Promise<HookInput | null> {
  if (process.stdin.isTTY) return null;
  return new Promise<HookInput | null>((resolve) => {
    let buf = '';
    const finish = (): void => {
      const trimmed = buf.trim();
      if (trimmed.length === 0) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          resolve(null);
          return;
        }
        resolve(parsed as HookInput);
      } catch {
        resolve(null);
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c: string) => { buf += c; });
    process.stdin.on('end', () => { clearTimeout(timer); finish(); });
    process.stdin.on('error', () => { clearTimeout(timer); finish(); });
  });
}

function emitContext(additionalContext: string): void {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  }));
}

function emitEmpty(): void {
  console.log("{}");
}

function emitHookResult(
  driftSet: boolean,
  base: string | null,
  expectedRender: boolean,
): void {
  let additionalContext: string | null = base;
  if (driftSet) {
    additionalContext = additionalContext === null
      ? RULESET_AMBIENT
      : `${RULESET_AMBIENT}\n\n${additionalContext}`;
  }

  if (additionalContext === null) {
    emitEmpty();
  } else {
    emitContext(additionalContext);
  }

  if (expectedRender) {
    try {
      setExpectedRender();
    } catch {
      // Flag writes are best-effort; prompt path stays valid.
    }
  }

  if (driftSet) {
    try {
      clearDriftFlag();
    } catch {
      // Reminder clearing is best-effort after successful stdout emit.
    }
  }
}

function bumpTurnCounter(): void {
  try {
    mutateState((state) => ({
      ...state,
      turnCounter: state.turnCounter + 1,
    }));
  } catch {
    // Cadence bookkeeping must never break the user's prompt path.
  }
}

function tokenIdFromState(state: BuddyStateV4): bigint | null {
  if (state.tokenId === null) {
    return null;
  }

  try {
    return BigInt(state.tokenId);
  } catch {
    return null;
  }
}


async function resolveAmbientAccount(args: CliArgs): Promise<string | null> {
  if (args.uuid) {
    const overridden = args.uuid.trim().toLowerCase();
    return isValidUuid(overridden) ? overridden : null;
  }
  try {
    const { config } = await readClaudeConfig();
    const candidate = extractIdentity(config).accountUuid.trim().toLowerCase();
    return isValidUuid(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function runHook(args: CliArgs): Promise<void> {
  // Outer try/catch is the last line of defense — every nested call
  // already soft-fails, but anything we missed must NOT bubble up to
  // main()'s stderr+exit-1 path because that pollutes the user's
  // prompt path with hook errors.
  try {
    const hookInput = await readHookInput();
    if (hookInput === null) {
      // Malformed/TTY/empty stdin emits `{}` immediately; do not fall
      // through to ambient/RPC. No turnCounter bump — there was no real
      // UserPromptSubmit to count.
      emitEmpty();
      return;
    }

    // Clear stale expected-render from prior turn — Stop hook may not have
    // run (user interrupt, hook timeout, hook disabled). Current turn sets
    // expected-render again only if it emits DISPLAY_BUDDY.
    try {
      consumeExpectedRender();
    } catch {
      // Best-effort stale flag wipe.
    }
    let isFirstPrompt = false;
    try {
      isFirstPrompt = consumeSessionFresh();
    } catch {
      // Best-effort session-fresh wipe.
    }

    const driftSet = isDriftFlagSet();
    // Do NOT clear drift flag here; the chokepoint clears it only after
    // successfully emitting the wrapped reminder.
    const route = routePrompt(hookInput.prompt);

    switch (route.kind) {
      case "mutate": {
        try {
          mutateState((state) => ({ ...state, mode: route.verb }));
          emitHookResult(driftSet, [
            "BUDDY_RENDER_BEGIN",
            `mode updated: \`${route.verb}\``,
            "BUDDY_RENDER_END",
          ].join("\n"), false);
        } catch {
          emitHookResult(driftSet, null, false);
        }
        bumpTurnCounter();
        return;
      }

      case "lookup": {
        const payload = await resolveLookupPayload({});
        if (!payload) {
          emitHookResult(driftSet, null, false);
          bumpTurnCounter();
          return;
        }
        emitHookResult(driftSet, formatLookupBlock(payload, isFirstPrompt), false);
        bumpTurnCounter();
        return;
      }

      case "invalid": {
        emitHookResult(driftSet, formatInvalidVerbBlock(route.verb), false);
        bumpTurnCounter();
        return;
      }

      case "ambient": {
        const state = readState() ?? defaultState();
        const identity = await readIdentityTuple();
        const effective = deriveEffective(state, identity, getEnvMode());

        if (effective.reason === "identity-mismatch") {
          emitHookResult(driftSet, null, false);
          bumpTurnCounter();
          return;
        }

        if (effective.effectiveMode === "off") {
          emitHookResult(driftSet, null, false);
          bumpTurnCounter();
          return;
        }

        const everyNth = derivedEveryNth(effective.effectiveMode);
        if (state.turnCounter % everyNth !== 0) {
          emitHookResult(driftSet, null, false);
          bumpTurnCounter();
          return;
        }

        const accountUuid = await resolveAmbientAccount(args);
        if (!accountUuid) {
          emitHookResult(driftSet, null, false);
          bumpTurnCounter();
          return;
        }

        const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
        let frame: { rows: string[] } | null = null;
        if (state.hatch === "warm") {
          const tokenId = tokenIdFromState(state);
          if (tokenId !== null) {
            frame = await renderAmbientFrame({
              projectDir,
              accountUuid,
              tokenId,
              net: getActiveNetwork(),
            });
          }
        } else {
          frame = sleepingFrame({ accountUuid });
        }

        if (frame === null) {
          emitHookResult(driftSet, null, false);
          bumpTurnCounter();
          return;
        }

        const sleepRows = applySleepIndicator(frame.rows, state, effective);
        let coldNudge = {
          rows: sleepRows,
          jokeOverrides: sleepRows.map(() => null) as (string | null)[],
        };
        let coldNudgeActive = false;

        if (state.hatch === "cold") {
          let nextCounter: number | null = null;
          try {
            const written = mutateState((s) => ({
              ...s,
              coldNudgeCounter: s.coldNudgeCounter + 1,
            }));
            nextCounter = written.coldNudgeCounter;
          } catch {
            // Decoration bookkeeping is best-effort. Skip the nudge, but
            // keep the normal sleeping sprite on the user's prompt path.
          }

          const fire = nextCounter !== null && nextCounter > 0 && nextCounter % 10 === 0;
          if (fire) {
            coldNudge = applyColdNudge(sleepRows, true);
            coldNudgeActive = true;
          }
        }

        const context = buildAdditionalContext(coldNudge.rows, {
          jokeOverrides: coldNudge.jokeOverrides,
          coldNudgeActive,
        });
        if (context === null) {
          // Sprite normalized to zero visible rows — fail closed rather
          // than emit an empty `DISPLAY_BUDDY` block.
          emitHookResult(driftSet, null, false);
          bumpTurnCounter();
          return;
        }
        emitHookResult(driftSet, context, true);
        bumpTurnCounter();
        return;
      }
    }
  } catch {
    // Outer soft-fail. Should never fire — every nested call already
    // wraps its own throws. No turnCounter bump because we cannot
    // confirm whether the upstream UserPromptSubmit even reached us.
    emitEmpty();
  }
}

// ---------- main -----------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.missingValueFor !== null) {
    console.error(`buddy-onchain: ${args.missingValueFor} requires a value`);
    console.error("Run with --help for usage.");
    process.exit(2);
  }

  if (args.invalidArgs.length > 0) {
    console.error(`buddy-onchain: unknown option ${args.invalidArgs[0]}`);
    console.error("Run with --help for usage.");
    process.exit(2);
  }

  if (args.stop && (args.hook || args.sessionStart || args.uuid !== null)) {
    console.error(
      "buddy-onchain: --stop is mutually exclusive with --hook, --session-start, and --uuid",
    );
    console.error("Run with --help for usage.");
    process.exit(2);
  }

  if (args.sessionStart && (args.hook || args.uuid !== null)) {
    console.error(
      "buddy-onchain: --session-start is mutually exclusive with --hook and --uuid",
    );
    console.error("Run with --help for usage.");
    process.exit(2);
  }

  if (args.sessionStart) {
    await runSessionStart();
  } else if (args.hook) {
    await runHook(args);
  } else if (args.stop) {
    await runStopHook();
  } else {
    console.error("buddy-onchain: expected --session-start, --hook, or --stop");
    console.error("Run with --help for usage.");
    process.exit(2);
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`buddy-onchain: ${msg}`);
  process.exit(1);
});

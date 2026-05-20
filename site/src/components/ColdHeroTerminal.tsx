// site/src/components/ColdHeroTerminal.tsx
//
// Hero block for the cold landing (`/`). Owns the structural action prompt
// `> claude ▊` and the indented walkthrough that streams in beneath it as
// fake terminal output.
//
// Behavior:
//   - Walkthrough lines stream on page load via CSS-driven typewriter (per-
//     line `width: 0 → Nch` with `steps()` timing). Lines stay visible after
//     animation completes.
//   - `> claude ▊` cursor is autofocused + clickable. Enter (when focused)
//     or click → walkthrough re-streams from scratch (replay).
//   - Replay implemented via `key` increment on the lines container — React
//     unmount + remount restarts CSS animations cleanly. No setTimeout
//     bookkeeping, no in-flight cleanup.
//   - `prefers-reduced-motion: reduce` → CSS skips animation, lines render
//     instantly. No JS branch needed.
//   - The cursor block reuses `.blinking-cursor__block` directly (NOT the
//     `<BlinkingCursor />` component, which renders its own `>` sigil and
//     would produce `> claude >▊`).

import { useEffect, useState } from 'react';

import {
  PLUGIN_INSTALL_COMMAND,
  PLUGIN_MARKETPLACE_ADD_COMMAND,
} from '../lib/pluginCommands';
import './ColdHeroTerminal.css';

import type { CSSProperties, ReactNode } from 'react';

// Events that count as user interaction for the idle-on-load gate. The
// `> claude ▊` action prompt is autofocused on cold load, and Chromium
// historically matches `:focus-visible` on autofocus — which would
// paint the row-fill on mount and violate the focus-on-load posture
// (see `docs/site/terminal-ui.md` § Focus-on-load posture). We delay
// applying `.hover-row` (the class that hooks the variant hover/focus
// tokens) until ANY of these fires, after which the row participates
// in normal hover/focus cycling.
const INTERACTION_EVENTS = [
  'keydown',
  'pointerdown',
  'pointermove',
  'wheel',
  'touchstart',
] as const;

// One walkthrough line. `text` is the visible-character payload used to
// compute the typewriter clip width (`--chars`); `render` is the styled
// JSX that actually paints. The two must agree on visible character count.
// `indent` is the line's left indent in `ch` units — applied via CSS
// `padding-left` so wrap continuation rows align with the line's indent
// column instead of dropping to col 0 (consistent with NEXT STEP body
// wrap behavior).
type WalkthroughLine = {
  text: string;
  indent: number;
  render: ReactNode;
};

// Outer Claude Code prompts at depth 1 (4ch); plugin route outcomes at
// depth 2 (8ch).
const INDENT_OUTER = 4;
const INDENT_OUTCOME = 8;

const WALKTHROUGH_LINES: readonly WalkthroughLine[] = [
  {
    text: `> ${PLUGIN_MARKETPLACE_ADD_COMMAND}`,
    indent: INDENT_OUTER,
    render: (
      <>
        <span className="cold-hero__sigil">{'>'}</span>{' '}
        <span className="cold-hero__command">{PLUGIN_MARKETPLACE_ADD_COMMAND}</span>
      </>
    ),
  },
  {
    text: `> ${PLUGIN_INSTALL_COMMAND}`,
    indent: INDENT_OUTER,
    render: (
      <>
        <span className="cold-hero__sigil">{'>'}</span>{' '}
        <span className="cold-hero__command">{PLUGIN_INSTALL_COMMAND}</span>
      </>
    ),
  },
  {
    text: `> /buddy-onchain`,
    indent: INDENT_OUTER,
    render: (
      <>
        <span className="cold-hero__sigil">{'>'}</span>{' '}
        <span className="cold-hero__command">/buddy-onchain</span>
      </>
    ),
  },
  {
    text: `hatch  ->  buddy not yet onchain (needs a Base-compatible wallet)`,
    indent: INDENT_OUTCOME,
    render: (
      <>
        <span className="cold-hero__verb">hatch</span>
        {'  ->  buddy not yet onchain (needs a Base-compatible wallet)'}
      </>
    ),
  },
  {
    text: `view   ->  buddy is already onchain`,
    indent: INDENT_OUTCOME,
    render: (
      <>
        <span className="cold-hero__verb">view</span>
        {'   ->  buddy is already onchain'}
      </>
    ),
  },
];

// Per-char duration, in ms. Tuned for terminal-cinematic feel — fast enough
// to not feel sluggish across 5 lines, slow enough to register as typing.
const CHAR_MS = 22;
// Inter-line gap — the pause between one line finishing and the next
// starting. Makes the cadence feel like a real terminal printing output
// in chunks rather than one continuous stream.
const INTER_LINE_MS = 90;

// Pre-computed cumulative delays so each line's animation kicks in at the
// right moment in the staggered sequence. Stable across renders — derived
// once at module load.
const LINE_DELAYS_MS: readonly number[] = (() => {
  const delays: number[] = [];
  let cursor = 0;
  for (const line of WALKTHROUGH_LINES) {
    delays.push(cursor);
    cursor += line.text.length * CHAR_MS + INTER_LINE_MS;
  }
  return delays;
})();

export function ColdHeroTerminal(): JSX.Element {
  // Bumping `replayKey` remounts the lines container, which restarts every
  // line's CSS animation from frame 0 — the simplest way to "replay".
  const [replayKey, setReplayKey] = useState(0);
  // Idle-on-load gate. `.hover-row` (the variant-token hook) only mounts
  // after the user has done something — pressed a key, moved the mouse,
  // touched the screen, scrolled. Until then the autofocused button
  // stays unlit even if the browser matches `:focus-visible` on
  // autofocus. See `docs/site/terminal-ui.md` § Focus-on-load posture.
  const [interactionReady, setInteractionReady] = useState(false);

  useEffect(() => {
    if (interactionReady) return;
    const onInteract = (): void => setInteractionReady(true);
    INTERACTION_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onInteract, { once: true, passive: true }),
    );
    return () => {
      INTERACTION_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, onInteract),
      );
    };
  }, [interactionReady]);

  return (
    <div className="cold-hero">
      <button
        type="button"
        className={`terminal-action-row terminal-action-row--interactive cold-hero__prompt${interactionReady ? ' hover-row' : ''}`}
        autoFocus
        onClick={() => setReplayKey((k) => k + 1)}
        title="next steps"
      >
        <span className="cold-hero__prompt-sigil hover-row__sigil">
          {'>'}
        </span>{' '}
        <span className="cold-hero__prompt-cmd hover-row__key">claude</span>{' '}
        {/*
          Bare cursor block — reuses BlinkingCursor's CSS rule for the
          glowing block + blink animation, but NOT the component (which
          renders its own `>` sigil and would collide with ours).
        */}
        <span className="blinking-cursor__block" aria-hidden="true" />
      </button>

      <div
        key={replayKey}
        className="cold-hero__walkthrough"
        aria-live="off"
        data-testid="cold-hero-walkthrough"
      >
        {WALKTHROUGH_LINES.map((line, idx) => {
          const style: CSSProperties = {
            ['--chars' as string]: line.text.length,
            ['--indent' as string]: `${line.indent}ch`,
            ['--type-duration' as string]: `${line.text.length * CHAR_MS}ms`,
            ['--type-delay' as string]: `${LINE_DELAYS_MS[idx]}ms`,
          };
          return (
            <div
              // Replay key on parent already forces remount; the per-line
              // key just disambiguates within the list.
              key={idx}
              className="cold-hero__line"
              style={style}
            >
              {line.render}
            </div>
          );
        })}
      </div>
    </div>
  );
}

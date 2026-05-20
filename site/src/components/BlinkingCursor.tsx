// `>▊` prompt — `>` sigil + a blinking block cursor (1.05s, steps(2, start)).
// `prefers-reduced-motion: reduce` disables the blink via CSS and holds the
// cursor in its visible state.

import './BlinkingCursor.css';

export function BlinkingCursor(): JSX.Element {
  return (
    <span className="blinking-cursor" role="presentation">
      <span className="blinking-cursor__sigil">&gt;</span>
      <span className="blinking-cursor__block" aria-hidden="true" />
    </span>
  );
}

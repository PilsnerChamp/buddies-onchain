// Terminal window primitive: mac-style traffic-light dots, centered `<h1>`
// title from the `title` prop, body container that scrolls on mobile,
// optional blinking `>▊` prompt at the tail. Used by every terminal route.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BlinkingCursor } from './BlinkingCursor';
import { ROUTES } from '../config/routes';
import './TerminalFrame.css';

type TerminalFrameProps = {
  /**
   * Terminal title string. Rendered inside the header as the document-level
   * `<h1>` so every route that uses `TerminalFrame` gets a structural `<h1>`
   * for its brand strip. Pre-interpolated dots (`·`) are preserved as-is;
   * separators are colored via CSS, not JSX splitting.
   */
  title: string;
  /**
   * Body content. Consumers typically pass a sequence of `<ManPageSection>`
   * children plus a leading `<p class="route-command">` for the
   * `> /buddy-onchain --help` echo line.
   */
  children: ReactNode;
  /** When true, append the `>▊` blinking prompt at the tail of the body. */
  showCursor?: boolean;
};

export function TerminalFrame({
  title,
  children,
  showCursor = false,
}: TerminalFrameProps): JSX.Element {
  return (
    <div
      className="terminal-frame"
      role="main"
      aria-label="buddies-onchain.xyz terminal"
    >
      <header className="terminal-frame__header">
        <div className="terminal-frame__dots" aria-hidden="true">
          <span className="terminal-frame__dot terminal-frame__dot--red" />
          <span className="terminal-frame__dot terminal-frame__dot--yellow" />
          <span className="terminal-frame__dot terminal-frame__dot--green" />
        </div>
        <h1 className="terminal-frame__title">
          <Link to={ROUTES.home} className="terminal-frame__title-link">
            {title}
          </Link>
        </h1>
        {/* Right-column spacer balances the 1fr auto 1fr grid so the title
            sits perfectly centered. Inherits `aria-hidden` from the surrounding
            non-role container; no content to announce. */}
        <div className="terminal-frame__spacer" aria-hidden="true" />
      </header>
      <div className="terminal-frame__body">
        {children}
        {showCursor && (
          <div className="terminal-frame__prompt">
            <BlinkingCursor />
          </div>
        )}
      </div>
    </div>
  );
}

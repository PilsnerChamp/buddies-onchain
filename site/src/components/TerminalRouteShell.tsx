// site/src/components/TerminalRouteShell.tsx
//
// Shared route chrome for terminal pages. Owns the full-frame background,
// viewport stage, atmospheric layer, and TerminalFrame composition so routes
// only provide route-specific cursor/body content.
//
// Title doctrine: every dApp terminal carries the brand wordmark
// `BUDDIES·ONCHAIN·XYZ` as its identity-layer chrome. The body echo line
// (`> /hatch <uuid>`, `> /buddy-onchain --help`, etc.) carries route- and
// action-specific information. Title = session identity; echo = action.

import type { ReactNode } from 'react';
import { DotGridBackground } from './DotGridBackground';
import { TerminalFrame } from './TerminalFrame';
import './TerminalRouteShell.css';

const DEFAULT_TITLE = 'BUDDIES·ONCHAIN·XYZ';

type TerminalRouteShellProps = {
  title?: string;
  children: ReactNode;
  showCursor?: boolean;
};

export function TerminalRouteShell({
  title = DEFAULT_TITLE,
  children,
  showCursor = false,
}: TerminalRouteShellProps): JSX.Element {
  return (
    <>
      <DotGridBackground />
      <div className="terminal-route-shell">
        <div className="terminal-route-shell__orbs" aria-hidden="true" />
        <TerminalFrame title={title} showCursor={showCursor}>
          {children}
        </TerminalFrame>
      </div>
    </>
  );
}

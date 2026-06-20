// site/src/routes/Claim.tsx
//
// `/claim` route.
//
// Stage 2 dormant explainer. No wallet, no contract reads, no
// transaction states — same posture as Bare View. The route exists
// so the SEE ALSO `/claim` row on every other surface resolves to a
// real page rather than a 404 or a one-line warning.
//
// The route includes a disabled action prompt `> /claim ▊` (muted, no
// autoFocus, no Enter handler, no wiring) for visual parity with the other
// routes' command surfaces.
// An inline `stage 2 · not yet implemented` line sits beneath it.
// The disabled prompt is inert — `.hover-row--inert` + no cursor
// affordance, no click target.

import { ManPageSection } from '../components/ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from '../components/RouteMetadata';
import { RouteStatus } from '../components/RouteStatus';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES } from '../config/routes';

import './Claim.css';

const SEE_ALSO_ROUTES: readonly SeeAlsoRoute[] = [
  { to: ROUTES.home, description: 'install the plugin' },
  { to: ROUTES.hatch, description: 'hatch your buddy' },
  { to: ROUTES.view, description: 'look up any buddy' },
];

export function Claim(): JSX.Element {
  return (
    <TerminalRouteShell>
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">/claim --help</span>
      </p>

      <ManPageSection heading="STATUS">
        <RouteStatus lead="stage 2" detail="not yet implemented" tone="warn" />
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">
        <p className="route-prose">
          This is where the holder of an account would claim their buddy —
          one action that moves custody of the hatched buddy from the
          Buddies Onchain contract to a wallet they control. The token stays
          soulbound throughout; only the custody address moves, never a sale
          or a transfer to anyone else.
        </p>
        <p className="route-prose route-prose--spaced">
          This requires proof that the wallet signer also controls the
          account behind the UUID. No coding-tool provider exposes a way to
          prove that today. Until one does, this path in the contract stays
          switched off.
        </p>
        <p className="route-prose route-prose--spaced">
          Stage 2 may never activate. Buddies staying at the contract is one
          of two valid end states for this project, not a waiting state.
        </p>
      </ManPageSection>

      <ManPageSection heading="NEXT STEPS">
        <p className="route-prose">
          Nothing to do here. Stage 1 is the only live path — run{' '}
          <span className="route-accent">/buddy-onchain</span> in Claude
          Code to hatch a buddy.
        </p>
        {/* Disabled action prompt — visual parity with other routes'
            action-prompt slot. Plain `<p>` (NOT a button), inert
            `.hover-row--inert` so no hover affordance, no cursor
            change. Cursor slot renders as a muted static block (not
            blinking, not accent-glow) so the row reads as "this would
            be an action prompt if Stage 2 shipped" without any active
            signal. Inline `stage 2 · not yet implemented` line sits
            beneath. */}
        <p
          className="terminal-action-row terminal-action-row--inert claim-action hover-row hover-row--inert"
          aria-disabled="true"
        >
          <span className="claim-action__sigil">&gt;</span>{' '}
          <span className="claim-action__command">/claim</span>{' '}
          <span className="claim-action__cursor" aria-hidden="true" />
        </p>
        <p className="claim-action__inline">
          stage 2 <span className="claim-action__sep">·</span>{' '}
          <span className="status-text--warning">not yet implemented</span>
        </p>
      </ManPageSection>

      <RouteMetadata
        chainId={ACTIVE_NETWORK.chainId}
        seeAlsoRoutes={SEE_ALSO_ROUTES}
      />
    </TerminalRouteShell>
  );
}

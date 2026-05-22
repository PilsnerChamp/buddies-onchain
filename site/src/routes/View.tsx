// site/src/routes/View.tsx
//
// Bare `/view` route.
// Manual UUID lookup page — no wallet, no contract reads. Pre-deploy
// is fine here.
//
// The action prompt is rendered as a single inline:
//
//   > /view [00000000-0000-4000-8000-000000000000] ▊
//
// The brackets are part of the visual register (terminal-style optional
// argument); the muted UUID inside the brackets is a `placeholder`
// hint, not submitted text. Submission rules (unified across whole-row
// click + Enter inside the input) live in `ViewLookupAction.tsx`:
// valid UUID → navigate; invalid non-empty input → warn line; empty →
// warn line on click for visible feedback.

import { ManPageSection } from '../components/ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from '../components/RouteMetadata';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import { ViewLookupAction } from '../components/ViewLookupAction';
import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES } from '../config/routes';

import './View.css';

const SEE_ALSO_ROUTES: readonly SeeAlsoRoute[] = [
  { to: ROUTES.hatch, description: 'hatch your buddy' },
  { to: ROUTES.bond, description: 'stage 2' },
];

export function View(): JSX.Element {
  return (
    <TerminalRouteShell>
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">/view --help</span>
      </p>

      <ManPageSection heading="STATUS">
        <p className="route-status">
          no id supplied
          <span className="route-status__sep"> · </span>
          <span className="route-status__detail">
            enter an account UUID to view a buddy
          </span>
        </p>
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">
        <p className="route-prose">
          Buddies are looked up by Claude account UUID. The best path is to
          run <span className="route-accent">/buddy-onchain</span> in Claude
          Code — it tells you where your buddy is and gives you the right
          link. Or paste a UUID below to open the buddy page directly.
        </p>
      </ManPageSection>

      <ManPageSection heading="NEXT STEP">
        <p className="route-prose">
          Paste an account UUID, then press Enter to open the buddy page.
        </p>
        <ViewLookupAction />
      </ManPageSection>

      <RouteMetadata
        chainId={ACTIVE_NETWORK.chainId}
        seeAlsoRoutes={SEE_ALSO_ROUTES}
      />
    </TerminalRouteShell>
  );
}

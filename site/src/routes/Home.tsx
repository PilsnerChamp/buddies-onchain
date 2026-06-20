// `/` cold landing — man-page composition.
//
// Section order: NAME / DESCRIPTION / NEXT STEP / AUTHOR / SEE ALSO. STATUS
// and REQUIREMENTS are absent on cold (no wallet, no preflight, no submission
// state to report). The wallet hint is inlined into the walkthrough's
// `hatch ->` outcome line.
//
// `<ColdHeroTerminal />` between NEXT STEP and AUTHOR renders the autofocused
// action prompt `> claude ▊` and streams the walkthrough beneath it as if
// `claude` had just been typed.
//
// `TerminalRouteShell` is mounted without `showCursor` — the `> claude ▊`
// block IS the page's cursor-of-record. Cold uses ASCII separators (` - `)
// and arrows (`->`); sibling routes (`/hatch`, `/view`, `/claim`) use `·` and
// `→`.

import { ColdHeroTerminal } from '../components/ColdHeroTerminal';
import { ManPageSection } from '../components/ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from '../components/RouteMetadata';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES } from '../config/routes';
import { DESCRIPTION } from '../lib/onchainConstants';

const SEE_ALSO_ROUTES: readonly SeeAlsoRoute[] = [
  { to: ROUTES.view, description: 'look up any buddy' },
  { to: ROUTES.claim, description: 'stage 2' },
];

export function Home(): JSX.Element {
  return (
    <TerminalRouteShell>
      {/*
        Command-line chrome. Rendered as `<p>` (non-interactive text
        rendition of a command — not a link, not a button, not a heading).
      */}
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">/buddy-onchain --help</span>
      </p>

      <ManPageSection heading="NAME">
        <span className="route-accent">/buddy-onchain</span>
        {' - hatch your buddy onchain.'}
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">{DESCRIPTION}</ManPageSection>

      <ManPageSection heading="NEXT STEP">
        <p className="route-prose">
          Run <span className="route-accent">claude</span> in your terminal
          and install the <span className="route-accent">buddy-onchain</span>
          {' '}plugin.
        </p>
      </ManPageSection>

      <ColdHeroTerminal />

      <RouteMetadata
        chainId={ACTIVE_NETWORK.chainId}
        seeAlsoRoutes={SEE_ALSO_ROUTES}
      />
    </TerminalRouteShell>
  );
}

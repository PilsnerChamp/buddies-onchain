// site/src/routes/View.tsx
//
// Bare `/view` route. Manual UUID lookup keeps the UUID in React state only:
// valid input resolves client-side through §2 identityHash →
// getTokenIdByIdentity, then navigates to the canonical `/view/<tokenId>` URL.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ManPageSection } from '../components/ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from '../components/RouteMetadata';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import { ViewLookupAction } from '../components/ViewLookupAction';
import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES, viewTokenPath } from '../config/routes';
import { useBuddyLookup } from '../lib/useBuddyLookup';

import './View.css';

const SEE_ALSO_ROUTES: readonly SeeAlsoRoute[] = [
  { to: ROUTES.hatch, description: 'hatch your buddy' },
  { to: ROUTES.bond, description: 'stage 2' },
];

function lookupStatusLine(
  submittedUuid: string | null,
  result: ReturnType<typeof useBuddyLookup>,
): { lead: string; detail: string; tone?: string } {
  if (submittedUuid === null || result.status === 'idle') {
    return {
      lead: 'no id supplied',
      detail: 'enter an account UUID to view a buddy',
    };
  }
  if (result.status === 'loading') {
    return { lead: 'looking up', detail: 'resolving token id', tone: 'awaiting' };
  }
  if (result.status === 'error') {
    return { lead: 'lookup failed', detail: 'try again', tone: 'warn' };
  }
  if (result.data.state === 'pre-deploy') {
    return {
      lead: 'not deployed',
      detail: 'contract not yet deployed on this network',
      tone: 'warn',
    };
  }
  if (result.data.state === 'miss') {
    return {
      lead: 'not found',
      detail: 'no buddy for this UUID on this network',
      tone: 'warn',
    };
  }
  return { lead: 'found', detail: `redirecting to /view/${result.data.tokenId}` };
}

function LookupFeedback({
  result,
}: {
  result: ReturnType<typeof useBuddyLookup>;
}): JSX.Element | null {
  if (result.status === 'loading') {
    return <p className="view-uuid__loading">looking up buddy…</p>;
  }
  if (result.status === 'error') {
    return (
      <p className="view-uuid__warn" role="alert">
        ! lookup failed — try refreshing the page
      </p>
    );
  }
  if (result.status === 'success' && result.data.state === 'pre-deploy') {
    return (
      <p className="view-uuid__warn" role="alert">
        ! Buddies Onchain is not yet deployed on this network
      </p>
    );
  }
  if (result.status === 'success' && result.data.state === 'miss') {
    return (
      <p className="view-uuid__warn" role="alert">
        ! no buddy found for that UUID on this network
      </p>
    );
  }
  return null;
}

export function View(): JSX.Element {
  const navigate = useNavigate();
  const [submittedUuid, setSubmittedUuid] = useState<string | null>(null);
  const result = useBuddyLookup(submittedUuid, ACTIVE_NETWORK.chainId);
  const statusLine = lookupStatusLine(submittedUuid, result);

  useEffect(() => {
    if (result.status !== 'success') return;
    if (result.data.state !== 'hit') return;
    navigate(viewTokenPath(result.data.tokenId), { replace: true });
  }, [navigate, result]);

  return (
    <TerminalRouteShell>
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">/view --help</span>
      </p>

      <ManPageSection heading="STATUS">
        <p className="route-status">
          {statusLine.lead}
          <span className="route-status__sep"> · </span>
          <span
            className={
              statusLine.tone
                ? `route-status__detail route-status__detail--${statusLine.tone}`
                : 'route-status__detail'
            }
          >
            {statusLine.detail}
          </span>
        </p>
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">
        <p className="route-prose">
          Buddies are looked up by Claude account UUID. The best path is to
          run <span className="route-accent">/buddy-onchain</span> in Claude
          Code — it tells you where your buddy is and gives you the right
          link. Or paste a UUID below to resolve its token page.
        </p>
      </ManPageSection>

      <ManPageSection heading="NEXT STEP">
        <p className="route-prose">
          Paste an account UUID, then press Enter to open the buddy page.
        </p>
        <ViewLookupAction onValidUuid={setSubmittedUuid} />
        <LookupFeedback result={result} />
      </ManPageSection>

      <RouteMetadata
        chainId={ACTIVE_NETWORK.chainId}
        seeAlsoRoutes={SEE_ALSO_ROUTES}
        seo={{ robots: 'noindex, follow', canonicalPath: ROUTES.view }}
      />
    </TerminalRouteShell>
  );
}

// site/src/components/LookupConsole.tsx
//
// The unified `/view` lookup console. Bare `/view` and the
// `/view/<tokenId>` miss state are the same terminal command surface in two
// states — "no arg supplied" and "arg supplied, lookup missed" — so they
// render one console; STATUS (and the command header echoing what was
// typed) are the only differences. See `docs/site/terminal-ui.md`
// § Lookup console.
//
// The console owns the whole lookup flow for both grammars:
//   - token id → navigate to `/view/<id>` (push). Miss-state retries stamp
//     `retriedMiss` router state so a landing miss mounts with the not-found
//     warn; bare `/view` submits do not.
//   - account UUID → resolve client-side (identityHash →
//     getTokenIdByIdentity) and navigate to the canonical `/view/<tokenId>`
//     on hit. The UUID lives in component state only — never in a URL.
// Async UUID lookup feedback renders in one line under the prompt; typing
// resets it (`onInputChange` → clear submitted UUID) so the sync warn and
// async feedback never describe different attempts at once.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES, viewTokenPath } from '../config/routes';
import { useBuddyLookup } from '../lib/useBuddyLookup';
import { ManPageSection } from './ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from './RouteMetadata';
import { TerminalRouteShell } from './TerminalRouteShell';
import { ViewLookupAction } from './ViewLookupAction';

export type LookupConsoleVariant =
  | { kind: 'bare' }
  | { kind: 'miss'; tokenId: bigint; retried: boolean };

const BARE_SEE_ALSO: readonly SeeAlsoRoute[] = [
  { to: ROUTES.hatch, description: 'hatch your buddy' },
  { to: ROUTES.bond, description: 'stage 2' },
];

// `/hatch` intentionally absent — hatch starts from the plugin handoff, not
// a miss-card CTA (`docs/site/terminal-ui.md` § Per-route row order).
const MISS_SEE_ALSO: readonly SeeAlsoRoute[] = [
  { to: ROUTES.home, description: 'install the plugin' },
  { to: ROUTES.view, description: 'look up any buddy' },
  { to: ROUTES.bond, description: 'stage 2' },
];

function statusLine(
  variant: LookupConsoleVariant,
  submittedUuid: string | null,
  result: ReturnType<typeof useBuddyLookup>,
): { lead: string; detail: string; tone?: string } {
  // The miss state pins STATUS to the page's own verdict; UUID-attempt
  // states render in the feedback line below the prompt instead.
  if (variant.kind === 'miss') {
    return {
      lead: 'not found',
      detail: 'no buddy for this token on this network',
      tone: 'warn',
    };
  }
  if (submittedUuid === null || result.status === 'idle') {
    return {
      lead: 'no id supplied',
      detail: 'enter a token id or account UUID',
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
    return <p className="view-uuid__loading view-uuid__feedback">looking up buddy…</p>;
  }
  if (result.status === 'error') {
    return (
      <p className="view-uuid__warn view-uuid__feedback" role="alert">
        ! lookup failed — try refreshing the page
      </p>
    );
  }
  if (result.status === 'success' && result.data.state === 'pre-deploy') {
    return (
      <p className="view-uuid__warn view-uuid__feedback" role="alert">
        ! Buddies Onchain is not yet deployed on this network
      </p>
    );
  }
  if (result.status === 'success' && result.data.state === 'miss') {
    return (
      <p className="view-uuid__warn view-uuid__feedback" role="alert">
        ! no buddy found for that UUID on this network
      </p>
    );
  }
  return null;
}

export function LookupConsole({
  variant,
}: {
  variant: LookupConsoleVariant;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const chainId = ACTIVE_NETWORK.chainId;
  const [submittedUuid, setSubmittedUuid] = useState<string | null>(null);
  const [uuidAttemptKey, setUuidAttemptKey] = useState(0);
  const result = useBuddyLookup(submittedUuid, chainId);
  const status = statusLine(variant, submittedUuid, result);
  const isMiss = variant.kind === 'miss';
  const missTokenId = isMiss ? variant.tokenId.toString() : null;
  const hitTokenId =
    result.status === 'success' && result.data.state === 'hit'
      ? result.data.tokenId.toString()
      : null;

  useEffect(() => {
    if (hitTokenId === null) return;
    if (missTokenId !== null && hitTokenId === missTokenId) {
      void queryClient.invalidateQueries({
        queryKey: ['buddy-token', chainId, hitTokenId],
      });
      return;
    }
    // Replace is intentional: UUID lookup is a transient console entry.
    navigate(viewTokenPath(hitTokenId), { replace: true });
  }, [chainId, hitTokenId, missTokenId, navigate, queryClient, uuidAttemptKey]);

  return (
    <TerminalRouteShell>
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">
          {isMiss ? `/view ${variant.tokenId.toString()}` : '/view --help'}
        </span>
      </p>

      <ManPageSection heading="STATUS">
        <p className="route-status">
          {status.lead}
          <span className="route-status__sep"> · </span>
          <span
            className={
              status.tone
                ? `route-status__detail route-status__detail--${status.tone}`
                : 'route-status__detail'
            }
          >
            {status.detail}
          </span>
        </p>
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">
        {isMiss ? (
          <p className="route-prose">
            The token id is well-formed — no buddy is minted under
            #{variant.tokenId.toString()} on this network.
          </p>
        ) : (
          <p className="route-prose">
            A buddy answers to two ids — its public token id, and the account
            UUID it hatched from. The best path is to
            run <span className="route-accent">/buddy-onchain</span> in Claude
            Code — it tells you where your buddy is and gives you the right
            link. Or enter either id below.
          </p>
        )}
      </ManPageSection>

      <ManPageSection heading="NEXT STEPS">
        <p className="route-prose">
          {isMiss ? (
            <>
              Run <span className="route-accent">/buddy-onchain</span> in
              Claude Code — it shows your current buddy status and gives you
              the right link. Or try another token id or account UUID below.
            </>
          ) : (
            <>Enter a token id or account UUID, then press Enter to open the
            buddy page.</>
          )}
        </p>
        <ViewLookupAction
          currentTokenId={isMiss ? variant.tokenId : undefined}
          showNotFoundOnMount={isMiss && variant.retried}
          onValidTokenId={(id) => {
            if (isMiss) {
              navigate(viewTokenPath(id), { state: { retriedMiss: true } });
              return;
            }
            navigate(viewTokenPath(id));
          }}
          onValidUuid={(uuid) => {
            setUuidAttemptKey((key) => key + 1);
            setSubmittedUuid(uuid);
          }}
          onInputChange={() => {
            if (submittedUuid !== null) setSubmittedUuid(null);
          }}
        />
        <LookupFeedback key={uuidAttemptKey} result={result} />
      </ManPageSection>

      <RouteMetadata
        chainId={chainId}
        seeAlsoRoutes={isMiss ? MISS_SEE_ALSO : BARE_SEE_ALSO}
        seo={{
          robots: 'noindex, follow',
          canonicalPath: isMiss ? viewTokenPath(variant.tokenId) : ROUTES.view,
        }}
      />
    </TerminalRouteShell>
  );
}

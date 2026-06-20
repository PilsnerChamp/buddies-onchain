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

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES, viewTokenPath } from '../config/routes';
import { useBuddyLookup } from '../lib/useBuddyLookup';
import { ManPageSection } from './ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from './RouteMetadata';
import { RouteStatus, type RouteStatusTone } from './RouteStatus';
import { TerminalRouteShell } from './TerminalRouteShell';
import { ViewLookupAction } from './ViewLookupAction';

import './LookupConsole.css';

export type LookupConsoleVariant =
  | { kind: 'bare' }
  | { kind: 'miss'; tokenId: bigint; retried: boolean };

const BARE_SEE_ALSO: readonly SeeAlsoRoute[] = [
  { to: ROUTES.hatch, description: 'hatch your buddy' },
  { to: ROUTES.claim, description: 'stage 2' },
];

// `/hatch` intentionally absent — hatch starts from the plugin handoff, not
// a miss-card CTA (`docs/site/terminal-ui.md` § Per-route row order).
const MISS_SEE_ALSO: readonly SeeAlsoRoute[] = [
  { to: ROUTES.home, description: 'install the plugin' },
  { to: ROUTES.view, description: 'look up any buddy' },
  { to: ROUTES.claim, description: 'stage 2' },
];

type LookupStatus = {
  lead: string;
  detail: string;
  tone?: RouteStatusTone;
};

const MISS_STATUS: LookupStatus = {
  lead: 'not found',
  detail: 'no buddy for this token on this network',
  tone: 'warn',
};

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'pre-deploy' }
  | { kind: 'miss' }
  | { kind: 'hit'; tokenId: bigint };

type LookupFeedbackSpec = {
  className: string;
  role?: 'alert';
  text: string;
};

type StaticLookupStateKind = Exclude<LookupState['kind'], 'hit'>;

type LookupStateSurfaces = Record<
  StaticLookupStateKind,
  {
    status: LookupStatus;
    feedback: LookupFeedbackSpec | null;
  }
> & {
  hit: {
    status: (tokenId: bigint) => LookupStatus;
    feedback: null;
  };
};

const LOOKUP_STATE_SURFACES: LookupStateSurfaces = {
  idle: {
    status: {
      lead: 'no id supplied',
      detail: 'enter a token id or account UUID',
    },
    feedback: null,
  },
  loading: {
    status: {
      lead: 'looking up',
      detail: 'resolving token id',
      tone: 'awaiting',
    },
    feedback: {
      className: 'view-uuid__loading view-uuid__feedback',
      text: 'looking up buddy…',
    },
  },
  error: {
    status: { lead: 'lookup failed', detail: 'try again', tone: 'warn' },
    feedback: {
      className: 'view-uuid__warn view-uuid__feedback',
      role: 'alert',
      text: '! lookup failed — try refreshing the page',
    },
  },
  'pre-deploy': {
    status: {
      lead: 'not deployed',
      detail: 'contract not yet deployed on this network',
      tone: 'warn',
    },
    feedback: {
      className: 'view-uuid__warn view-uuid__feedback',
      role: 'alert',
      text: '! Buddies Onchain is not yet deployed on this network',
    },
  },
  miss: {
    status: {
      lead: 'not found',
      detail: 'no buddy for this UUID on this network',
      tone: 'warn',
    },
    feedback: {
      className: 'view-uuid__warn view-uuid__feedback',
      role: 'alert',
      text: '! no buddy found for that UUID on this network',
    },
  },
  hit: {
    status: (tokenId) => ({
      lead: 'found',
      detail: `redirecting to /view/${tokenId.toString()}`,
    }),
    feedback: null,
  },
};

function lookupStateFromResult(
  result: ReturnType<typeof useBuddyLookup>,
): LookupState {
  if (result.status === 'idle') return { kind: 'idle' };
  if (result.status === 'loading') return { kind: 'loading' };
  if (result.status === 'error') return { kind: 'error' };
  if (result.data.state === 'pre-deploy') return { kind: 'pre-deploy' };
  if (result.data.state === 'miss') return { kind: 'miss' };
  return { kind: 'hit', tokenId: result.data.tokenId };
}

function lookupStatus(state: LookupState): LookupStatus {
  if (state.kind === 'hit') {
    return LOOKUP_STATE_SURFACES.hit.status(state.tokenId);
  }
  return LOOKUP_STATE_SURFACES[state.kind].status;
}

type LookupConsoleConfig = {
  commandEcho: string;
  description: ReactNode;
  nextSteps: ReactNode;
  currentTokenId?: bigint;
  showNotFoundOnMount: boolean;
  status?: LookupStatus;
  onValidTokenId: (tokenId: bigint) => void;
  seeAlsoRoutes: readonly SeeAlsoRoute[];
  canonicalPath: string;
};

function PluginFirstSentence({
  lead,
  body,
}: {
  lead: string;
  body: string;
}): JSX.Element {
  return (
    <>
      {lead} <span className="route-accent">/buddy-onchain</span> in Claude
      Code — {body}
    </>
  );
}

function lookupConsoleConfig(
  variant: LookupConsoleVariant,
  navigate: ReturnType<typeof useNavigate>,
): LookupConsoleConfig {
  switch (variant.kind) {
    case 'bare':
      return {
        commandEcho: '/view --help',
        description: (
          <p className="route-prose">
            A buddy answers to two ids — its public token id, and the account
            UUID it hatched from. The best path is to{' '}
            <PluginFirstSentence
              lead="run"
              body="it tells you where your buddy is and gives you the right link."
            />{' '}
            Or enter either id below.
          </p>
        ),
        nextSteps: (
          <p className="route-prose">
            Enter a token id or account UUID, then press Enter to open the
            buddy page.
          </p>
        ),
        showNotFoundOnMount: false,
        onValidTokenId: (id) => navigate(viewTokenPath(id)),
        seeAlsoRoutes: BARE_SEE_ALSO,
        canonicalPath: ROUTES.view,
      };
    case 'miss':
      return {
        commandEcho: `/view ${variant.tokenId.toString()}`,
        description: (
          <p className="route-prose">
            The token id is well-formed — no buddy is minted under
            #{variant.tokenId.toString()} on this network.
          </p>
        ),
        nextSteps: (
          <p className="route-prose">
            <PluginFirstSentence
              lead="Run"
              body="it shows your current buddy status and gives you the right link."
            />{' '}
            Or try another token id or account UUID below.
          </p>
        ),
        currentTokenId: variant.tokenId,
        showNotFoundOnMount: variant.retried,
        status: MISS_STATUS,
        onValidTokenId: (id) =>
          navigate(viewTokenPath(id), { state: { retriedMiss: true } }),
        seeAlsoRoutes: MISS_SEE_ALSO,
        canonicalPath: viewTokenPath(variant.tokenId),
      };
  }
}

function LookupFeedback({
  feedback,
}: {
  feedback: LookupFeedbackSpec | null;
}): JSX.Element | null {
  if (feedback === null) return null;
  return (
    <p className={feedback.className} role={feedback.role}>
      {feedback.text}
    </p>
  );
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
  const lookupState = lookupStateFromResult(result);
  const lookupSurface = LOOKUP_STATE_SURFACES[lookupState.kind];
  const config = lookupConsoleConfig(variant, navigate);
  const status = config.status ?? lookupStatus(lookupState);
  const currentTokenId = config.currentTokenId;
  const currentTokenIdString = currentTokenId?.toString() ?? null;
  const hitTokenId =
    result.status === 'success' && result.data.state === 'hit'
      ? result.data.tokenId.toString()
      : null;

  useEffect(() => {
    if (hitTokenId === null) return;
    if (currentTokenIdString !== null && hitTokenId === currentTokenIdString) {
      void queryClient.invalidateQueries({
        queryKey: ['buddy-token', chainId, hitTokenId],
      });
      return;
    }
    // Replace is intentional: UUID lookup is a transient console entry.
    navigate(viewTokenPath(hitTokenId), { replace: true });
  }, [
    chainId,
    currentTokenIdString,
    hitTokenId,
    navigate,
    queryClient,
    uuidAttemptKey,
  ]);

  return (
    <TerminalRouteShell>
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">{config.commandEcho}</span>
      </p>

      <ManPageSection heading="STATUS">
        <RouteStatus
          lead={status.lead}
          detail={status.detail}
          tone={status.tone}
        />
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">{config.description}</ManPageSection>

      <ManPageSection heading="NEXT STEPS">
        {config.nextSteps}
        <ViewLookupAction
          currentTokenId={currentTokenId}
          showNotFoundOnMount={config.showNotFoundOnMount}
          onValidTokenId={config.onValidTokenId}
          onValidUuid={(uuid) => {
            setUuidAttemptKey((key) => key + 1);
            setSubmittedUuid(uuid);
          }}
          onInputChange={() => {
            if (submittedUuid !== null) setSubmittedUuid(null);
          }}
        />
        <LookupFeedback key={uuidAttemptKey} feedback={lookupSurface.feedback} />
      </ManPageSection>

      <RouteMetadata
        chainId={chainId}
        seeAlsoRoutes={config.seeAlsoRoutes}
        seo={{
          robots: 'noindex, follow',
          canonicalPath: config.canonicalPath,
        }}
      />
    </TerminalRouteShell>
  );
}

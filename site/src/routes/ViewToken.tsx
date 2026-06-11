// site/src/routes/ViewToken.tsx
//
// Canonical `/view/:tokenId` route. Token pages load tokenURI(tokenId)
// directly; no UUID/hash step runs here.

import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { LookupConsole } from '../components/LookupConsole';
import { RouteSeo } from '../components/RouteMetadata';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES, viewTokenPath } from '../config/routes';
import { parseTokenId } from '../lib/parseTokenId';
import { useBuddyToken } from '../lib/useBuddyLookup';

import './View.css';

export function ViewToken(): JSX.Element {
  const params = useParams<{ tokenId: string }>();
  const tokenId = parseTokenId(params.tokenId ?? '');

  if (tokenId === null) {
    return <NotFoundView />;
  }

  return <ViewTokenSurface tokenId={tokenId} />;
}

function ViewTokenSurface({ tokenId }: { tokenId: bigint }): JSX.Element {
  const result = useBuddyToken(tokenId, ACTIVE_NETWORK.chainId);
  // Retry navigations stamp router state so a retry that lands on another
  // miss mounts with the not-found warn visible — otherwise the new console
  // is near-identical to the old one and the attempt reads as a no-op.
  // The flag is consumed immediately, but only after the route has resolved
  // to a miss, so reload/back-forward mounts are warn-free again.
  const location = useLocation();
  const navigate = useNavigate();
  const retriedMiss = Boolean(
    (location.state as { retriedMiss?: boolean } | null)?.retriedMiss,
  );
  const isMiss = result.status === 'success' && result.data.state === 'miss';

  useEffect(() => {
    if (!isMiss || !retriedMiss) return;
    navigate(viewTokenPath(tokenId), { replace: true, state: null });
  }, [isMiss, navigate, retriedMiss, tokenId]);

  if (result.status === 'loading') {
    return (
      <ViewShell tokenId={tokenId}>
        <p className="view-uuid__loading">loading buddy #{tokenId.toString()}…</p>
      </ViewShell>
    );
  }

  if (result.status === 'error') {
    return (
      <ViewShell tokenId={tokenId}>
        <p className="view-uuid__warn" role="alert">
          ! could not load buddy metadata — try refreshing the page
        </p>
      </ViewShell>
    );
  }

  if (result.data.state === 'pre-deploy') {
    return (
      <ViewShell tokenId={tokenId}>
        <p className="view-uuid__warn" role="alert">
          ! Buddies Onchain is not yet deployed on this network
        </p>
      </ViewShell>
    );
  }

  if (result.data.state === 'miss') {
    // The miss state renders the unified lookup console (shared with bare
    // `/view`). Keyed by id: a retry navigation re-renders the same route
    // element, and without the key React preserves the console's input/warn
    // state across navigations — the mount-time not-found warn would never
    // re-apply.
    return (
      <LookupConsole
        key={tokenId.toString()}
        variant={{ kind: 'miss', tokenId, retried: retriedMiss }}
      />
    );
  }

  return <HappyPath tokenId={tokenId} svg={result.data.svg} />;
}

function NotFoundView(): JSX.Element {
  return (
    <TerminalRouteShell showCursor>
      <RouteSeo robots="noindex, follow" canonicalPath={ROUTES.view} />
      <p className="view-uuid__warn" role="alert">
        ! not found — token id must be a positive integer within uint256
      </p>
    </TerminalRouteShell>
  );
}

function HappyPath({
  tokenId,
  svg,
}: {
  tokenId: bigint;
  svg: string;
}): JSX.Element {
  return (
    <BuddyRenderErrorBoundary tokenId={tokenId}>
      <RouteSeo canonicalPath={viewTokenPath(tokenId)} />
      <TerminalRouteShell>
        <div
          className="view-uuid__buddy"
          role="img"
          aria-label="buddy"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </TerminalRouteShell>
    </BuddyRenderErrorBoundary>
  );
}

class BuddyRenderErrorBoundary extends Component<
  { children: ReactNode; tokenId: bigint },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; tokenId: bigint }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.warn('[view] buddy render failed', { error, info });
  }
  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ViewShell tokenId={this.props.tokenId}>
          <p className="view-uuid__warn" role="alert">
            ! could not render buddy — open another tab and try again
          </p>
        </ViewShell>
      );
    }
    return this.props.children;
  }
}

function ViewShell({
  children,
  tokenId,
}: {
  children: ReactNode;
  tokenId: bigint;
}): JSX.Element {
  return (
    <TerminalRouteShell showCursor>
      <RouteSeo canonicalPath={viewTokenPath(tokenId)} />
      {children}
    </TerminalRouteShell>
  );
}

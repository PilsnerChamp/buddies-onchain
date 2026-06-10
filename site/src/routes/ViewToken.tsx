// site/src/routes/ViewToken.tsx
//
// Canonical `/view/:tokenId` route. Token pages load tokenURI(tokenId)
// directly; no UUID/hash step runs here.

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import { ManPageRow } from '../components/ManPageRow';
import { RouteSeo } from '../components/RouteMetadata';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES, viewTokenPath } from '../config/routes';
import { useBuddyToken } from '../lib/useBuddyLookup';

import './View.css';

function parseTokenId(raw: string): bigint | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  const tokenId = BigInt(raw);
  return tokenId > 0n ? tokenId : null;
}

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

  return (
    <HappyPath
      tokenId={tokenId}
      svg={result.data.svg}
      provider={result.data.provider}
    />
  );
}

function NotFoundView(): JSX.Element {
  return (
    <TerminalRouteShell showCursor>
      <RouteSeo robots="noindex, follow" canonicalPath={ROUTES.view} />
      <p className="view-uuid__warn" role="alert">
        ! not found — token id must be a positive number
      </p>
    </TerminalRouteShell>
  );
}

function HappyPath({
  tokenId,
  svg,
  provider,
}: {
  tokenId: bigint;
  svg: string;
  provider: string;
}): JSX.Element {
  return (
    <BuddyRenderErrorBoundary tokenId={tokenId}>
      <RouteSeo canonicalPath={viewTokenPath(tokenId)} />
      <TerminalRouteShell>
        <div className="view-token__register" aria-label="token metadata">
          <ManPageRow k="provider" v={provider} />
        </div>
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

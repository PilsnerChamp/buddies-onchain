// site/src/routes/ViewUuid.tsx
//
// `/view/:uuid` route.
// Loading / error / pre-deploy states mount `<TerminalRouteShell
// showCursor>` so the tail `> ▊` prompt is the cursor-of-record. The
// happy path is a read-only NFT card — no command prompt, no cursor;
// it mounts `<TerminalRouteShell>` bare. The miss card carries an
// action prompt slot (`<ViewLookupAction>` shared with bare `/view`)
// which owns the cursor slot, so it also drops `showCursor`.
//
// Wallet-free: data layer is `useBuddyLookup` (TanStack Query wrapper
// around a hardcoded HTTP `publicClient`). NO wagmi imports —
// `WagmiProvider` is not in scope on `/view`, and the route mounts via
// the lazy `HatchLayout`-bypassing branch in `App.tsx`.

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { ManPageSection } from '../components/ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from '../components/RouteMetadata';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import { ViewLookupAction } from '../components/ViewLookupAction';
import { ACTIVE_NETWORK } from '../config/network';
import { ROUTES } from '../config/routes';
import { isValidUuid } from '~shared/isValidUuid';
import { useBuddyLookup } from '../lib/useBuddyLookup';

import './View.css';

const RAW_LOG_MAX = 64;

const MISS_SEE_ALSO_ROUTES: readonly SeeAlsoRoute[] = [
  { to: ROUTES.home, description: 'install the plugin' },
  { to: ROUTES.view, description: 'look up another buddy' },
  { to: ROUTES.bond, description: 'stage 2' },
];

// ── Route entry ──────────────────────────────────────────────────────────
export function ViewUuid(): JSX.Element {
  const params = useParams<{ uuid: string }>();
  const raw = params.uuid ?? '';
  const uuid = raw.trim().toLowerCase();

  if (uuid === '' || !isValidUuid(uuid)) {
    const reason: 'missing' | 'malformed' =
      uuid === '' ? 'missing' : 'malformed';
    // eslint-disable-next-line no-console
    console.warn('[view] invalid uuid, redirecting to /', {
      reason,
      raw: reason === 'missing' ? null : raw.slice(0, RAW_LOG_MAX),
    });
    return <Navigate to={ROUTES.home} replace />;
  }

  return <ViewUuidSurface uuid={uuid} />;
}

// ── Main surface ─────────────────────────────────────────────────────────
function ViewUuidSurface({ uuid }: { uuid: string }): JSX.Element {
  const result = useBuddyLookup(uuid, ACTIVE_NETWORK.chainId);

  if (result.status === 'loading') {
    return (
      <ViewShell>
        <p className="view-uuid__loading">looking up buddy…</p>
      </ViewShell>
    );
  }

  if (result.status === 'error') {
    const copy =
      result.kind === 'tokenId'
        ? '! lookup failed — try refreshing the page'
        : '! could not load buddy metadata — try refreshing the page';
    return (
      <ViewShell>
        <p className="view-uuid__warn" role="alert">
          {copy}
        </p>
      </ViewShell>
    );
  }

  // status === 'success'
  const { data } = result;
  if (data.state === 'pre-deploy') {
    return <PreDeployView />;
  }
  if (data.state === 'miss') {
    return <MissCard uuid={uuid} />;
  }
  return <HappyPath svg={data.svg} />;
}

// ── Pre-deploy view ──────────────────────────────────────────────────────
function PreDeployView(): JSX.Element {
  return (
    <ViewShell>
      <p className="view-uuid__warn" role="alert">
        ! Buddies Onchain is not yet deployed on this network
      </p>
    </ViewShell>
  );
}

// ── Miss card ────────────────────────────────────────────────────────────
function MissCard({ uuid }: { uuid: string }): JSX.Element {
  return (
    // Miss card mounts WITHOUT `showCursor` — the lookup action
    // prompt up in NEXT STEPS owns the cursor slot. Two blinking
    // cursors fighting for attention reads as visual noise; the
    // action prompt is the only cursor on the page. Loading / error
    // / pre-deploy states still mount via `<ViewShell>` with
    // `showCursor` since they have no action prompt.
    <TerminalRouteShell>
      {/* Echo header is `> /view <uuid>` per `docs/site/terminal-ui.md`
          § Routes and command echoes — the canonical UUID lookup uses
          the path arg as the command arg, so no `--help` form here. */}
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">/view</span>{' '}
        <span className="view-uuid__echo-uuid">{uuid}</span>
      </p>

      <ManPageSection heading="STATUS">
        <p className="route-status">
          not found
          <span className="route-status__sep"> · </span>
          <span className="route-status__detail route-status__detail--warn">
            no buddy for this UUID on this network
          </span>
        </p>
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">
        <p className="route-prose">
          The UUID is valid, but this network has no buddy for it. The
          account may not have hatched yet, or this may not be the UUID you
          meant to view.
        </p>
      </ManPageSection>

      <ManPageSection heading="NEXT STEPS">
        {/* Miss-state copy renders the `[home page](/)` phrase as an in-prose
            `<Link>` to `ROUTES.home`. */}
        <p className="route-prose">
          If this is your account, install the buddy-onchain plugin.
          The{' '}
          <Link className="route-accent" to={ROUTES.home}>
            home page
          </Link>{' '}
          has the details.
        </p>
        <p className="route-prose route-prose--spaced">
          Otherwise, check the UUID or try another lookup.
        </p>
        {/* Cross-route action-prompt slot per `docs/site/terminal-ui.md`
            § Cross-route action prompt slot — every actionable route
            renders an action prompt after NEXT STEPS so the user can
            re-engage without navigating back to /view. Same
            `<ViewLookupAction>` component as bare /view (shared markup
            + .view-action* styles). The action prompt owns the cursor
            slot, so the shared `<MissShell>` below mounts WITHOUT
            `showCursor`. */}
        <ViewLookupAction />
      </ManPageSection>

      <RouteMetadata
        chainId={ACTIVE_NETWORK.chainId}
        seeAlsoRoutes={MISS_SEE_ALSO_ROUTES}
      />
    </TerminalRouteShell>
  );
}

// ── Happy path render ────────────────────────────────────────────────────
function HappyPath({ svg }: { svg: string }): JSX.Element {
  // Happy path is a read-only NFT card — no command prompt, no cursor.
  // Mounts <TerminalRouteShell> bare, NOT through <ViewShell> (which
  // carries `showCursor` for loading/error/pre-deploy states).
  return (
    <BuddyRenderErrorBoundary>
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

// ── Error boundary ───────────────────────────────────────────────────────
class BuddyRenderErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
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
        <ViewShell>
          <p className="view-uuid__warn" role="alert">
            ! could not render buddy — open another tab and try again
          </p>
        </ViewShell>
      );
    }
    return this.props.children;
  }
}

// ── Shared shell ─────────────────────────────────────────────────────────
//
// Mounts `<TerminalRouteShell showCursor>` so miss/loading/error states
// render the tail `> ▊` prompt (no action prompt on this read-only
// route — tail cursor IS the cursor-of-record per
// `docs/site/terminal-ui.md` § Cursor slot exclusivity).
function ViewShell({ children }: { children: ReactNode }): JSX.Element {
  return <TerminalRouteShell showCursor>{children}</TerminalRouteShell>;
}

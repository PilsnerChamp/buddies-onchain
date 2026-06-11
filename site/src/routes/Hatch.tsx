// site/src/routes/Hatch.tsx
//
// `/hatch#identityHash=0x…&prngSeed=…&provider=…` warm execution terminal.
// `App.tsx` owns fragment parse/validate/scrub and passes the handoff values
// as props.
//
// The bracketed-button lifecycle is gone, replaced by the action-prompt +
// appended-stream model that mirrors cold's `> claude ▊` register. Running
// the action prompt IS the hatch command; wallet connect is a side effect,
// not a separate visible step.
//
// Sections (man-page order):
//   echo `> /hatch --help`
//   STATUS (state-driven copy per the locked state matrix)
//   DESCRIPTION (Stage 1 mechanics — not Block E)
//   REQUIREMENTS (handoff + wallet rows)
//   NEXT STEP — gas warning + action prompt + appended stream output
//   separator rail
//   AUTHOR
//   SEE ALSO (cold-shape: row-anchor markup, ASCII separators, plain
//             `stage 2`, github↔PilsnerChamp/buddies-onchain)
//
// State machine (derives both STATUS and stream output):
//   idle (pre-click)              → STATUS "ready to hatch", no stream
//   connecting wallet (post-click,
//     wallet modal open)          → STATUS "connecting wallet", stream
//                                   "connecting wallet…"
//   wallet connected → submit     → stream appends "wallet connected · 0x…"
//   submitting (wallet tx prompt) → STATUS "submitting transaction",
//                                   stream appends "submitting transaction…"
//   pending (tx broadcast)        → STATUS "awaiting confirmation",
//                                   stream appends "awaiting confirmation
//                                   · 0xabc…1234 ↗"
//   confirmed                     → STATUS "hatched · redirecting to
//                                   /view/<tokenId>", stream appends
//                                   "confirmed · token #N" then
//                                   "✓ buddy hatched · redirecting to
//                                   /view/<tokenId> in 5s…"; navigate after 5s
//   failed (post-broadcast)       → action prompt re-activates; stream
//                                   shows tx hash + `! <error>`
//   failed (pre-signature)        → action prompt re-activates; stream
//                                   shows `! <error>` only
//   event-parse-failed            → STATUS "hatched · open /view"; stream
//                                   "hatch confirmed — open /view…"
//   pre-deploy                    → STATUS "contract not yet deployed
//                                   on this network"; action prompt muted

import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useReadContract } from 'wagmi';
import type { ProviderBytes16 } from '~shared/providerBytes16';

import { ManPageRow } from '../components/ManPageRow';
import { ManPageSection } from '../components/ManPageSection';
import { RouteMetadata, type SeeAlsoRoute } from '../components/RouteMetadata';
import { RouteStatus, type RouteStatusTone } from '../components/RouteStatus';
import { TerminalRouteShell } from '../components/TerminalRouteShell';
import '../components/BlinkingCursor.css';
import { getNetwork } from '../config/chains';
import { ACTIVE_NETWORK } from '../config/network';
import { BUDDY_NFT_ABI } from '../config/contract';
import { ROUTES, viewTokenPath } from '../config/routes';
import {
  useHatchFlow,
  type HatchErrorCategory,
  type HatchState,
} from '../lib/hatch';

import './Hatch.css';

const SEE_ALSO_ROUTES: readonly SeeAlsoRoute[] = [
  { to: ROUTES.view, description: 'look up any buddy' },
  { to: ROUTES.bond, description: 'stage 2' },
];

// Canonical DESCRIPTION text for warm /hatch. Hard-wrapped via
// explicit newlines; CSS `white-space: pre-wrap` preserves them.
const HATCH_DESCRIPTION =
  'Stage 1 of buddy evolution. Your buddy is derived from your\n' +
  'account by the plugin and minted directly into the\n' +
  'Buddies Onchain contract. One account, one buddy,\n' +
  'one mint. Soulbound.';

const GAS_WARNING_COPY =
  'Sign a single Base transaction — you pay your own gas.';

// Events that count as user interaction for the idle-on-load hover
// gate. Same list as cold-hero — the autofocused `> /hatch ▊`
// action prompt stays unlit until the user does something. See
// `docs/site/terminal-ui.md` § Focus-on-load posture.
const INTERACTION_EVENTS = [
  'keydown',
  'pointerdown',
  'pointermove',
  'wheel',
  'touchstart',
] as const;

// Per-chain explorer base for tx links (distinct from the address-page
// base used by SEE ALSO). Returns `null` on local + unconfigured chains
// so the caller renders a plain `<code>` with no anchor.
function getExplorerTxBase(chainId: number): string | null {
  const addressBase = getNetwork(chainId)?.explorerAddressBase ?? null;
  if (addressBase === null) return null;
  return addressBase.replace(/\/address\/$/, '/tx/');
}

// Address truncation: `0x` + first 8 hex + ellipsis + last 4 hex
// (see `docs/site/terminal-ui.md` § Truncation rules). Example:
// `0x1f3a5e2b…b209`.
function truncAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 10)}…${address.slice(-4)}`;
}

// Tx-hash truncation: 6…4 form (see `docs/site/terminal-ui.md`
// § Truncation rules). Example: `0xabc1…1234`.
function truncTxHash(hash: string): string {
  if (hash.length <= 11) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

// Maps hatch error categories to the terminal-line copy (see
// `docs/site/terminal-ui.md` § Hatch command-run stream).
function failureLineFor(category: HatchErrorCategory): string {
  switch (category) {
    case 'user-rejected':
      return 'tx cancelled — try again when ready';
    case 'already-hatched':
      return 'already hatched — see /view';
    case 'no-contract':
      return 'no contract on this network';
    case 'event-parse-failed':
      return 'hatch confirmed — open /view to find your buddy';
    case 'wallet-not-found':
      return 'wallet not found — install a Base-compatible wallet';
    case 'wallet-rejected':
      return 'wallet connection cancelled';
    case 'wrong-network':
      return `wrong network — switch wallet to ${ACTIVE_NETWORK.displayName} (${ACTIVE_NETWORK.chainId})`;
    case 'generic':
      return 'hatch failed — no buddy created';
  }
}

// ── Route entry ──────────────────────────────────────────────────────────
//
// App.tsx is the sole URL parse/validate/scrub owner. Hatch receives the
// already-validated pass-through values; after the scrub, rereading the URL
// would lose them.
export function Hatch({
  identityHash,
  prngSeed,
  provider,
}: {
  identityHash: `0x${string}`;
  prngSeed: number;
  provider: ProviderBytes16;
}): JSX.Element {
  return (
    <HatchSurface
      identityHash={identityHash}
      prngSeed={prngSeed}
      provider={provider}
    />
  );
}

// ── Main warm surface ────────────────────────────────────────────────────
function HatchSurface({
  identityHash,
  prngSeed,
  provider,
}: {
  identityHash: `0x${string}`;
  prngSeed: number;
  provider: ProviderBytes16;
}): JSX.Element {
  const { state, onRunHatch, activeChainId, isConnected, walletAddress } =
    useHatchFlow(identityHash, prngSeed, provider);

  // Active-chain contract for the preflight read.
  const preflightAddress = getNetwork(activeChainId)?.buddyNft ?? null;

  const { data: preflightTokenId } = useReadContract({
    abi: BUDDY_NFT_ABI,
    address: preflightAddress ?? undefined,
    functionName: 'getTokenIdByIdentity',
    args: [identityHash],
    query: { enabled: preflightAddress !== null },
  });
  const warmTokenId =
    typeof preflightTokenId === 'bigint' && preflightTokenId > 0n
      ? preflightTokenId
      : null;

  // Preflight redirect: account already has a buddy → skip the warm page
  // entirely. Render guard placed AFTER hooks so the hook order stays
  // stable when wagmi's read flips.
  if (warmTokenId !== null) {
    return <Navigate to={viewTokenPath(warmTokenId)} replace />;
  }

  // Confirmed-tx redirect — fires after the hook-owned countdown expires.
  // Render path means the route swap is a single React commit, no useEffect
  // sequencing.
  if (state.phase === 'confirmed' && state.redirectIn <= 0) {
    return <Navigate to={viewTokenPath(state.tokenId)} replace />;
  }

  return (
    <WarmHatchPage
      activeChainId={activeChainId}
      preflightAddress={preflightAddress}
      isConnected={isConnected}
      walletAddress={walletAddress}
      state={state}
      onAction={onRunHatch}
    />
  );
}

// ── Warm page render ─────────────────────────────────────────────────────
function WarmHatchPage({
  activeChainId,
  preflightAddress,
  isConnected,
  walletAddress,
  state,
  onAction,
}: {
  activeChainId: number;
  preflightAddress: `0x${string}` | null;
  isConnected: boolean;
  walletAddress: string | null;
  state: HatchState;
  onAction: () => void;
}): JSX.Element {
  // Pre-deploy gate: collapses to muted action prompt + STATUS reason
  // when active chain has no contract. Per § 3.8 chain-pinning, ANY
  // command record takes precedence.
  const hasSubmissionRecord = state.phase !== 'ready';
  const isPreDeploy = preflightAddress === null && !hasSubmissionRecord;

  const statusLine = computeStatusLine({
    isPreDeploy,
    state,
  });
  const actionMode = computeActionMode({ isPreDeploy, state });

  // Submission chain id for tx-hash explorer links — pinned by
  // `useHatchFlow`. Falls back to active chain id
  // when the state has no submission id (txHash is null in those
  // states anyway).
  const txChainId =
    (state.phase === 'pending' ||
      state.phase === 'confirmed' ||
      state.phase === 'failed') &&
    state.submissionChainId !== null
      ? state.submissionChainId
      : activeChainId;

  // Gas-warning visible whenever the action lifecycle is live. Hidden
  // pre-deploy (no action) and after confirmation (no further action).
  const showGasWarning = !isPreDeploy && state.phase !== 'confirmed';

  return (
    <TerminalRouteShell>
      {/* Echo header — `> /hatch --help` per `docs/site/terminal-ui.md`
          § Routes and command echoes. The action prompt below echoes a
          bare `> /hatch` — no UUID crosses the wire (pass-through handoff). */}
      <p className="route-command">
        <span className="route-command__sigil">&gt;</span>{' '}
        <span className="route-command__accent">/hatch --help</span>
      </p>

      <ManPageSection heading="STATUS">
        <RouteStatus
          lead={<span>{statusLine.lead}</span>}
          detail={statusLine.detail}
          tone={statusLine.tone}
        />
      </ManPageSection>

      <ManPageSection heading="DESCRIPTION">
        <p className="hatch-description">{HATCH_DESCRIPTION}</p>
      </ManPageSection>

      <ManPageSection heading="REQUIREMENTS">
        <ManPageRow
          k="handoff"
          v="identity hash + trait seed + provider"
          status={<span className="status-text--ok">connected</span>}
        />
        <ManPageRow
          k="wallet"
          v={
            isConnected && walletAddress
              ? truncAddress(walletAddress)
              : 'a Base-compatible wallet in your browser'
          }
          status={
            <span className={isConnected ? 'status-text--ok' : 'status-text--danger'}>
              {isConnected ? 'connected' : 'not connected'}
            </span>
          }
        />
      </ManPageSection>

      <ManPageSection heading="NEXT STEP">
        <div className="hatch-next">
          {showGasWarning && (
            <p className="hatch-next__gas">{GAS_WARNING_COPY}</p>
          )}
          <HatchActionPrompt
            mode={actionMode}
            onClick={onAction}
          />
          <HatchStream
            state={state}
            isPreDeploy={isPreDeploy}
            txChainId={txChainId}
          />
        </div>
      </ManPageSection>

      <RouteMetadata chainId={activeChainId} seeAlsoRoutes={SEE_ALSO_ROUTES} />
    </TerminalRouteShell>
  );
}

// ── STATUS line composer ─────────────────────────────────────────────────
type StatusTone = Extract<
  RouteStatusTone,
  'normal' | 'awaiting' | 'pre-deploy' | 'hatched'
>;
type StatusLine = {
  lead: string;
  detail: string;
  tone: StatusTone;
};

function computeStatusLine({
  isPreDeploy,
  state,
}: {
  isPreDeploy: boolean;
  state: HatchState;
}): StatusLine {
  if (isPreDeploy) {
    return {
      lead: 'not hatched',
      detail: 'contract not yet deployed on this network',
      tone: 'pre-deploy',
    };
  }
  // event-parse-failed special case: buddy exists, STATUS flips to
  // hatched · open /view (see `docs/site/terminal-ui.md`
  // § STATUS state matrix).
  if (state.phase === 'failed' && state.category === 'event-parse-failed') {
    return {
      lead: 'hatched',
      detail: 'open /view',
      tone: 'hatched',
    };
  }
  if (state.phase === 'confirmed') {
    return {
      lead: 'hatched',
      detail: `redirecting to ${viewTokenPath(state.tokenId)}`,
      tone: 'hatched',
    };
  }
  if (state.phase === 'submitting') {
    return {
      lead: 'not hatched',
      detail: 'submitting transaction',
      tone: 'awaiting',
    };
  }
  if (state.phase === 'pending') {
    return {
      lead: 'not hatched',
      detail: 'awaiting confirmation',
      tone: 'awaiting',
    };
  }
  if (state.phase === 'connecting-wallet') {
    return {
      lead: 'not hatched',
      detail: 'connecting wallet',
      tone: 'awaiting',
    };
  }
  // Default ready (pre-click, or post-failure ready-to-retry) — same
  // copy whether the wallet is connected or not, per the locked state
  // matrix (idle / wallet not connected and idle / wallet connected
  // both render `ready to hatch`).
  return {
    lead: 'not hatched',
    detail: 'ready to hatch',
    tone: 'normal',
  };
}

// ── Action prompt mode ───────────────────────────────────────────────────
type ActionMode = 'active' | 'committed' | 'muted';

function computeActionMode({
  isPreDeploy,
  state,
}: {
  isPreDeploy: boolean;
  state: HatchState;
}): ActionMode {
  if (isPreDeploy) return 'muted';
  // While the hatch flow is running (or post-confirmed pre-redirect),
  // the action prompt is committed plain text — the stream below
  // carries progress.
  if (
    state.phase === 'connecting-wallet' ||
    state.phase === 'submitting' ||
    state.phase === 'pending' ||
    state.phase === 'confirmed'
  ) {
    return 'committed';
  }
  // Failed → re-active so the user can retry by clicking again. Note
  // the special event-parse-failed case still re-activates (the user
  // can still trigger /view via SEE ALSO; re-activation is harmless
  // and consistent with the state matrix).
  if (state.phase === 'failed') return 'active';
  return 'active';
}

// ── Action prompt component ──────────────────────────────────────────────
//
// Three render modes:
//   - active: focusable `<button>` with sigil + cmd + blinking cursor.
//             Click / Enter triggers `onClick`. Carries `.hover-row`
//             only after first user interaction (idle-on-load posture
//             per `docs/site/terminal-ui.md` § Focus-on-load posture,
//             same gate as cold-hero).
//   - committed: plain text (no cursor, no button) — the hatch flow is
//                running and the stream below carries progress.
//   - muted: pre-deploy. Plain muted text, no cursor, no click.
function HatchActionPrompt({
  mode,
  onClick,
}: {
  mode: ActionMode;
  onClick: () => void;
}): JSX.Element {
  const [interactionReady, setInteractionReady] = useState(false);

  useEffect(() => {
    if (mode !== 'active') return;
    if (interactionReady) return;
    const onInteract = (): void => setInteractionReady(true);
    INTERACTION_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onInteract, { once: true, passive: true }),
    );
    return () => {
      INTERACTION_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, onInteract),
      );
    };
  }, [mode, interactionReady]);

  if (mode === 'muted') {
    return (
      <p
        className="terminal-action-row terminal-action-row--inert hatch-action hatch-action--muted"
        aria-disabled="true"
      >
        <span className="hatch-action__sigil">&gt;</span>{' '}
        <span className="hatch-action__command">/hatch</span>
      </p>
    );
  }

  if (mode === 'committed') {
    return (
      <p className="terminal-action-row hatch-action hatch-action--committed">
        <span className="hatch-action__sigil">&gt;</span>{' '}
        <span className="hatch-action__command">/hatch</span>
      </p>
    );
  }

  // active
  return (
    <button
      type="button"
      autoFocus
      onClick={onClick}
      className={`terminal-action-row terminal-action-row--interactive hatch-action hatch-action--active${interactionReady ? ' hover-row' : ''}`}
    >
      <span className="hatch-action__sigil hover-row__sigil">&gt;</span>{' '}
      <span className="hatch-action__command hover-row__key">/hatch</span>{' '}
      <span className="blinking-cursor__block" aria-hidden="true" />
    </button>
  );
}

// ── Stream output ────────────────────────────────────────────────────────
//
// Renders cumulative terminal-style output below the action prompt as
// the hatch flow progresses. Pure derivation from the current state +
// route-level flags — no internal state.
function HatchStream({
  state,
  isPreDeploy,
  txChainId,
}: {
  state: HatchState;
  isPreDeploy: boolean;
  txChainId: number;
}): JSX.Element | null {
  // Pre-deploy stream — single muted `— not yet deployed —` line per
  // `docs/site/terminal-ui.md` § Hatch command-run stream. Renders alongside the muted
  // action prompt; no other stream lines apply pre-deploy.
  if (isPreDeploy) {
    return (
      <div className="hatch-stream">
        <p className="hatch-stream__line hatch-stream__line--muted">
          — not yet deployed —
        </p>
      </div>
    );
  }

  const lines: JSX.Element[] = [];
  const hadConnectStep =
    state.phase !== 'ready' ? state.hadConnectStep : false;
  const connectedWallet =
    state.phase !== 'ready' &&
    state.phase !== 'connecting-wallet' &&
    state.walletAddress
      ? state.walletAddress
      : null;

  if (hadConnectStep) {
    lines.push(
      <p key="connect" className="hatch-stream__line">
        connecting wallet…
      </p>,
    );
    if (connectedWallet) {
      lines.push(
        <p key="connected" className="hatch-stream__line">
          wallet connected <span className="hatch-stream__sep">·</span>{' '}
          <code className="hatch-stream__addr">
            {truncAddress(connectedWallet)}
          </code>
        </p>,
      );
    }
  }

  // Submitting / pending / confirmed / failed phases — the post-click
  // sequence after the wallet connect step (or the immediate sequence
  // when the wallet was already connected at click time).
  if (state.phase === 'submitting') {
    lines.push(
      <p key="submitting" className="hatch-stream__line">
        submitting transaction…
      </p>,
    );
  }

  if (state.phase === 'pending') {
    lines.push(
      <p key="submitting" className="hatch-stream__line">
        submitting transaction…
      </p>,
      <p key="awaiting" className="hatch-stream__line">
        awaiting confirmation <span className="hatch-stream__sep">·</span>{' '}
        <TxHashLink txHash={state.txHash} chainId={txChainId} />
      </p>,
    );
  }

  if (state.phase === 'confirmed') {
    lines.push(
      <p key="submitting" className="hatch-stream__line">
        submitting transaction…
      </p>,
      <p key="awaiting" className="hatch-stream__line">
        awaiting confirmation <span className="hatch-stream__sep">·</span>{' '}
        <TxHashLink txHash={state.txHash} chainId={txChainId} />
      </p>,
      <p key="confirmed" className="hatch-stream__line">
        confirmed <span className="hatch-stream__sep">·</span> token #
        {String(state.tokenId)}
      </p>,
      <p
        key="redirect"
        className="hatch-stream__line hatch-stream__line--success"
        role="status"
      >
        ✓ buddy hatched <span className="hatch-stream__sep">·</span>{' '}
        redirecting to {viewTokenPath(state.tokenId)}
        <span aria-hidden="true"> in {state.redirectIn}s</span>
        <span
          className="blinking-cursor__block hatch-stream__cursor"
          aria-hidden="true"
        />
      </p>,
    );
  }

  if (state.phase === 'failed') {
    // Pre-signature failure (no txHash) → error line only (see
    // `docs/site/terminal-ui.md` § Hatch command-run stream).
    // Post-broadcast failure includes the
    // submit + awaiting trail above the error line for terminal continuity.
    if (state.txHash) {
      lines.push(
        <p key="submitting" className="hatch-stream__line">
          submitting transaction…
        </p>,
        <p key="awaiting" className="hatch-stream__line">
          awaiting confirmation <span className="hatch-stream__sep">·</span>{' '}
          <TxHashLink txHash={state.txHash} chainId={txChainId} />
        </p>,
      );
    }
    lines.push(
      <p
        key="error"
        className="hatch-stream__line hatch-stream__line--error"
        role="alert"
      >
        ! {failureLineFor(state.category)}
      </p>,
    );
  }

  if (lines.length === 0) return null;
  return <div className="hatch-stream">{lines}</div>;
}

// ── Tx-hash anchor ───────────────────────────────────────────────────────
function TxHashLink({
  txHash,
  chainId,
}: {
  txHash: string;
  chainId: number;
}): JSX.Element {
  const txBase = getExplorerTxBase(chainId);
  const display = truncTxHash(txHash);
  if (txBase === null) {
    return <code className="hatch-stream__hash">{display}</code>;
  }
  return (
    <a
      className="hatch-stream__hash hatch-stream__hash--link terminal-inline-link"
      href={`${txBase}${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {display} ↗
    </a>
  );
}

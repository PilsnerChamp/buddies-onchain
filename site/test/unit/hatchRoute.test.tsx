// site/test/unit/hatchRoute.test.tsx
//
// Covers the warm `/hatch` route render contract. The command lifecycle
// itself lives in `useHatchFlow` and is covered in hatchFlow.test.tsx;
// these tests mock the hook so route UI state-matrix assertions do not need
// Wagmi/RainbowKit providers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { HatchState } from '../../src/lib/hatch';

// ── Hooks mocks ──────────────────────────────────────────────────────────

const useReadContractMock = vi.fn<
  [unknown],
  { data: unknown; isLoading: boolean; error: Error | null }
>();

vi.mock('wagmi', () => ({
  useReadContract: (call: unknown) => useReadContractMock(call),
}));

type HatchFlowReturn = {
  state: HatchState;
  onRunHatch: () => void;
  activeChainId: number;
  isConnected: boolean;
  walletAddress: string | null;
};

let hatchFlowReturn: HatchFlowReturn;
let runHatchSpy: ReturnType<typeof vi.fn>;

vi.mock('../../src/lib/hatch', () => ({
  useHatchFlow: () => hatchFlowReturn,
}));

// `chains.ts` mock — route tests drive only `buddyNft` plus explorer base.
const getContractAddressMock = vi.fn<[number], `0x${string}` | null>();

vi.mock('../../src/config/chains', () => ({
  getNetwork: (chainId: number) => {
    const buddyNft = getContractAddressMock(chainId);
    const explorerAddressBase =
      chainId === 84532
        ? 'https://sepolia.basescan.org/address/'
        : chainId === 8453
          ? 'https://basescan.org/address/'
          : null;
    const displayName =
      chainId === 84532
        ? 'base sepolia'
        : chainId === 8453
          ? 'base'
          : chainId === 31337
            ? 'local'
            : 'unknown';
    return {
      key: 'local' as const,
      chainId,
      rpcUrl: '',
      explorerAddressBase,
      displayName,
      buddyNft,
      status: buddyNft === null ? 'not-yet-deployed' : 'deployed',
    };
  },
}));

// Imports after mocks so the route resolves to stubbed hooks.
import { Hatch } from '../../src/routes/Hatch';

// ── Helpers ──────────────────────────────────────────────────────────────

const VALID_IDENTITY_HASH =
  '0x11c1f0ff5f3422e0e9c64abda3c02ca65cb05b5fe768946f7f3f7b89ae3667f6' as const;
const VALID_PRNG_SEED = 4_116_242_804;
const DEPLOYED_ADDRESS = '0x1f3a5e2b00000000000000000000000000000000' as const;
const WALLET_ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01' as const;
const TX_HASH = '0xabc1234567890000000000000000000000000000000000000000000000001234' as const;

function setHatchFlow(
  state: HatchState,
  overrides: Partial<Omit<HatchFlowReturn, 'state' | 'onRunHatch'>> = {},
): void {
  runHatchSpy = vi.fn();
  hatchFlowReturn = {
    state,
    onRunHatch: runHatchSpy,
    activeChainId: 84532,
    isConnected: false,
    walletAddress: null,
    ...overrides,
  };
}

function renderHatchAt(path: string): { container: HTMLElement } {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<main data-testid="home-stub">home-stub</main>} />
        <Route
          path="/hatch"
          element={
            <Hatch
              identityHash={VALID_IDENTITY_HASH}
              prngSeed={VALID_PRNG_SEED}
            />
          }
        />
        <Route
          path="/view/:tokenId"
          element={<main data-testid="view-token-stub">view-token-stub</main>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function applyDefaults(): void {
  useReadContractMock.mockReset();
  useReadContractMock.mockReturnValue({
    data: 0n,
    isLoading: false,
    error: null,
  });

  getContractAddressMock.mockReset();
  getContractAddressMock.mockReturnValue(DEPLOYED_ADDRESS);

  setHatchFlow({ phase: 'ready' });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('/hatch — terminal frame + structure', () => {
  beforeEach(applyDefaults);
  afterEach(cleanup);

  it('renders the brand-wordmark terminal title', () => {
    renderHatchAt('/hatch');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'BUDDIES·ONCHAIN·XYZ',
    );
  });

  it('echoes `> /hatch --help` in the page header and a bare hatch action prompt', () => {
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.route-command__accent')?.textContent).toBe(
      '/hatch --help',
    );
    expect(container.querySelector('.hatch-action__command')?.textContent).toBe(
      '/hatch',
    );
  });

  it('does not render the pre-mint identityHash or prngSeed values', () => {
    const { container } = renderHatchAt('/hatch');
    const text = container.textContent ?? '';
    expect(text).not.toContain(VALID_IDENTITY_HASH);
    expect(text).not.toContain(String(VALID_PRNG_SEED));
  });

  it('renders sections in exact order: STATUS, DESCRIPTION, REQUIREMENTS, NEXT STEP, AUTHOR, SEE ALSO', () => {
    const { container } = renderHatchAt('/hatch');
    const headings = Array.from(
      container.querySelectorAll('.man-page-section__heading'),
    ).map((el) => el.textContent);
    expect(headings).toEqual([
      'STATUS',
      'DESCRIPTION',
      'REQUIREMENTS',
      'NEXT STEP',
      'AUTHOR',
      'SEE ALSO',
    ]);
  });

  it('DESCRIPTION matches the canonical Warm Landing text', () => {
    renderHatchAt('/hatch');
    expect(screen.getByText(/Stage 1 of buddy evolution/)).toBeTruthy();
    expect(
      screen.getByText(/One Claude account, one buddy, one mint\. Soulbound\./),
    ).toBeTruthy();
  });

  it('SEE ALSO renders cold-shape footer parity (plain `stage 2`, github↔repo-shorthand, ASCII separators, /hatch self-omits)', () => {
    const { container } = renderHatchAt('/hatch');
    expect(screen.getByText('/bond')).toBeTruthy();
    expect(screen.getByText('stage 2')).toBeTruthy();
    const seeAlsoText = container.querySelector('.see-also')?.textContent ?? '';
    expect(seeAlsoText).not.toContain('not yet implemented');
    expect(screen.getByText('github')).toBeTruthy();
    expect(screen.getByText('PilsnerChamp/buddies-onchain')).toBeTruthy();
    expect(seeAlsoText).not.toContain('source · manifesto · contracts');
    expect(seeAlsoText).not.toContain('/hatch');
  });

  it('does NOT render retired component classes', () => {
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch__brand')).toBeNull();
    expect(container.querySelector('.terminal-receipt')).toBeNull();
    expect(container.querySelector('.disclosure-block-a')).toBeNull();
    expect(container.querySelector('.hatch-action-button')).toBeNull();
    expect(container.querySelector('.footer')).toBeNull();
  });
});

describe('/hatch — state matrix', () => {
  beforeEach(applyDefaults);
  afterEach(cleanup);

  it('pre-deploy: muted action prompt (no cursor, no button), deploy reason in STATUS, no gas warning', () => {
    getContractAddressMock.mockReturnValue(null);
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--muted')).toBeTruthy();
    expect(container.querySelector('.hatch-action--active')).toBeNull();
    expect(container.querySelector('.blinking-cursor__block')).toBeNull();
    expect(screen.getByText(/contract not yet deployed on this network/)).toBeTruthy();
    expect(container.querySelector('.hatch-next__gas')).toBeNull();
    expect(screen.getByText('— not yet deployed —')).toBeTruthy();
  });

  it('wallet not connected: active action prompt, STATUS `ready to hatch`, gas warning visible', () => {
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--active')).toBeTruthy();
    expect(screen.getByText('ready to hatch')).toBeTruthy();
    expect(container.querySelector('.hatch-next__gas')).toBeTruthy();
  });

  it('wallet connected, ready: active action prompt + gas warning above', () => {
    setHatchFlow(
      { phase: 'ready' },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--active')).toBeTruthy();
    expect(screen.getByText('ready to hatch')).toBeTruthy();
    expect(
      screen.getByText('Sign a single Base transaction — you pay your own gas.'),
    ).toBeTruthy();
    const gas = container.querySelector('.hatch-next__gas');
    const action = container.querySelector('.hatch-action--active');
    expect(gas).toBeTruthy();
    expect(action).toBeTruthy();
    if (gas && action) {
      expect(
        gas.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('connecting-wallet: action prompt committed, stream `connecting wallet…`, STATUS `connecting wallet`', () => {
    setHatchFlow({ phase: 'connecting-wallet', hadConnectStep: true });
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--committed')).toBeTruthy();
    expect(screen.getByText('connecting wallet…')).toBeTruthy();
    expect(screen.getByText('connecting wallet')).toBeTruthy();
  });

  it('submitting after connect: stream includes wallet connected + submitting transaction…', () => {
    setHatchFlow(
      {
        phase: 'submitting',
        hadConnectStep: true,
        walletAddress: WALLET_ADDRESS,
      },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--committed')).toBeTruthy();
    expect(screen.getByText(/wallet connected/)).toBeTruthy();
    expect(container.querySelector('.hatch-stream__addr')?.textContent).toBe(
      '0xabcdef01…ef01',
    );
    expect(screen.getByText('submitting transaction…')).toBeTruthy();
    expect(container.querySelector('.hatch-next__gas')).toBeTruthy();
    expect(container.querySelector('.hatch-stream__hash')).toBeNull();
  });

  it('awaiting confirmation: action prompt committed, stream submitting + awaiting · <hash> ↗', () => {
    setHatchFlow(
      {
        phase: 'pending',
        txHash: TX_HASH,
        submissionChainId: 84532,
        hadConnectStep: false,
      },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--committed')).toBeTruthy();
    expect(screen.getByText('submitting transaction…')).toBeTruthy();
    expect(screen.getAllByText('awaiting confirmation').length).toBeGreaterThan(0);
    const txHash = container.querySelector('.hatch-stream__hash');
    expect(txHash).toBeTruthy();
    expect(txHash?.textContent ?? '').toMatch(/0xabc1.*1234/);
  });

  it('post-broadcast tx failure (hash exists): action prompt re-active, stream submitting + awaiting + error', () => {
    setHatchFlow(
      {
        phase: 'failed',
        category: 'generic',
        txHash: TX_HASH,
        submissionChainId: 84532,
        raw: null,
        hadConnectStep: false,
      },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--active')).toBeTruthy();
    expect(container.querySelector('.hatch-next__gas')).toBeTruthy();
    expect(container.querySelector('.hatch-stream__hash')).toBeTruthy();
    expect(screen.getByText(/hatch failed — no buddy created/)).toBeTruthy();
  });

  it('pre-signature user-rejected failure: action prompt re-active, stream is error line only', () => {
    setHatchFlow(
      {
        phase: 'failed',
        category: 'user-rejected',
        txHash: null,
        submissionChainId: null,
        raw: null,
        hadConnectStep: false,
      },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    const { container } = renderHatchAt('/hatch');
    expect(container.querySelector('.hatch-action--active')).toBeTruthy();
    expect(container.querySelector('.hatch-stream__hash')).toBeNull();
    expect(screen.getByText(/tx cancelled — try again when ready/)).toBeTruthy();
    expect(screen.queryByText('submitting transaction…')).toBeNull();
  });

  it('wallet-rejected failure: stream surfaces cancel error and STATUS reverts to `ready to hatch`', () => {
    setHatchFlow({
      phase: 'failed',
      category: 'wallet-rejected',
      txHash: null,
      submissionChainId: null,
      raw: null,
      hadConnectStep: true,
    });
    const { container } = renderHatchAt('/hatch');
    expect(screen.getByText('connecting wallet…')).toBeTruthy();
    expect(screen.getByText('! wallet connection cancelled')).toBeTruthy();
    expect(screen.queryByText('connecting wallet')).toBeNull();
    expect(screen.getByText('ready to hatch')).toBeTruthy();
    expect(container.querySelector('.hatch-action--active')).toBeTruthy();
  });

  it('wallet-not-found failure is reachable in the route stream', () => {
    setHatchFlow({
      phase: 'failed',
      category: 'wallet-not-found',
      txHash: null,
      submissionChainId: null,
      raw: null,
      hadConnectStep: false,
    });
    renderHatchAt('/hatch');
    expect(
      screen.getByText(/wallet not found — install a Base-compatible wallet/),
    ).toBeTruthy();
  });

  it('event-parse-failed: STATUS flips to `hatched · open /view`, stream carries `! hatch confirmed — open /view…`', () => {
    setHatchFlow(
      {
        phase: 'failed',
        category: 'event-parse-failed',
        txHash: TX_HASH,
        submissionChainId: 84532,
        raw: null,
        hadConnectStep: false,
      },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    renderHatchAt('/hatch');
    expect(screen.getByText('hatched')).toBeTruthy();
    expect(screen.getByText('open /view')).toBeTruthy();
    expect(
      screen.getByText(/hatch confirmed — open \/view to find your buddy/),
    ).toBeTruthy();
  });
});

describe('/hatch — REQUIREMENTS rows', () => {
  beforeEach(applyDefaults);
  afterEach(cleanup);

  it('handoff row confirms the scrubbed hash/seed pair without exposing values', () => {
    renderHatchAt('/hatch');
    expect(screen.getByText('handoff')).toBeTruthy();
    expect(screen.getByText('identity hash + trait seed')).toBeTruthy();
    expect(screen.getAllByText('connected').length).toBeGreaterThan(0);
  });

  it('wallet row shows browser-wallet description + · not connected when disconnected', () => {
    renderHatchAt('/hatch');
    expect(screen.getByText('a Base-compatible wallet in your browser')).toBeTruthy();
    expect(screen.getByText(/not connected/)).toBeTruthy();
  });

  it('wallet row flips to truncated 8…4 address when connected', () => {
    setHatchFlow(
      { phase: 'ready' },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    renderHatchAt('/hatch');
    expect(screen.getByText('0xabcdef01…ef01')).toBeTruthy();
  });
});

describe('/hatch — preflight + confirmed redirects', () => {
  beforeEach(applyDefaults);
  afterEach(cleanup);

  it('preflight tokenId>0 redirects to /view/<tokenId>', () => {
    useReadContractMock.mockReturnValue({
      data: 42n,
      isLoading: false,
      error: null,
    });
    renderHatchAt('/hatch');
    expect(useReadContractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'getTokenIdByIdentity',
        args: [VALID_IDENTITY_HASH],
      }),
    );
    expect(screen.getByTestId('view-token-stub')).toBeTruthy();
  });

  it('confirmed tx renders success stream while redirect countdown is positive', () => {
    setHatchFlow({
      phase: 'confirmed',
      txHash: TX_HASH,
      submissionChainId: 84532,
      tokenId: 247n,
      redirectIn: 5,
      hadConnectStep: false,
    });
    const { container } = renderHatchAt('/hatch');
    expect(screen.queryByTestId('view-token-stub')).toBeNull();
    expect(screen.getByText(/✓ buddy hatched/)).toBeTruthy();
    expect(screen.getByText(/token #247/)).toBeTruthy();
    expect(screen.getAllByText(/redirecting to \/view\/247/).length).toBeGreaterThan(0);
    expect(container.querySelector('.hatch-stream__cursor')).toBeTruthy();
  });

  it('confirmed tx navigates to /view/<tokenId> once hook countdown reaches zero', () => {
    setHatchFlow({
      phase: 'confirmed',
      txHash: TX_HASH,
      submissionChainId: 84532,
      tokenId: 247n,
      redirectIn: 0,
      hadConnectStep: false,
    });
    renderHatchAt('/hatch');
    expect(screen.getByTestId('view-token-stub')).toBeTruthy();
  });
});

describe('/hatch — chain-pinning (tx-pending precedence)', () => {
  beforeEach(applyDefaults);
  afterEach(cleanup);

  it('does NOT collapse to pre-deploy when activeChain is null but tx is pending', () => {
    getContractAddressMock.mockReturnValue(null);
    setHatchFlow(
      {
        phase: 'pending',
        txHash: TX_HASH,
        submissionChainId: 84532,
        hadConnectStep: false,
      },
      {
        activeChainId: 31337,
        isConnected: true,
        walletAddress: WALLET_ADDRESS,
      },
    );
    const { container } = renderHatchAt('/hatch');
    expect(screen.getAllByText('awaiting confirmation').length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/contract not yet deployed on this network/),
    ).toBeNull();
    expect(container.querySelector('.hatch-action--committed')).toBeTruthy();
    expect(container.querySelector('.hatch-action--muted')).toBeNull();
    expect(container.querySelector('.hatch-stream__hash--link')).toBeTruthy();
  });
});

describe('/hatch — command dispatch', () => {
  beforeEach(applyDefaults);
  afterEach(cleanup);

  it('clicking the active action prompt calls the flow owner', () => {
    const { container } = renderHatchAt('/hatch');
    const action = container.querySelector(
      '.hatch-action--active',
    ) as HTMLButtonElement | null;
    expect(action).toBeTruthy();
    expect(action!.disabled).toBe(false);
    fireEvent.click(action!);
    expect(runHatchSpy).toHaveBeenCalledTimes(1);
  });

  it('connected wallet with no RainbowKit modal still has an enabled prompt', () => {
    setHatchFlow(
      { phase: 'ready' },
      { isConnected: true, walletAddress: WALLET_ADDRESS },
    );
    const { container } = renderHatchAt('/hatch');
    const action = container.querySelector(
      '.hatch-action--active',
    ) as HTMLButtonElement | null;
    expect(action).toBeTruthy();
    expect(action!.disabled).toBe(false);
    fireEvent.click(action!);
    expect(runHatchSpy).toHaveBeenCalledTimes(1);
  });
});

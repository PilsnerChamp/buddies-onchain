// site/test/unit/hatchFlow.test.tsx
//
// Exercises the reducer-owned warm `/hatch` command lifecycle. Route tests
// mock this hook; these tests keep the real hook and mock Wagmi/RainbowKit
// boundaries.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { encodeEventTopics } from 'viem';

const chainIdRef = { current: 84532 };
const accountRef: {
  current: { isConnected: boolean; address?: `0x${string}` };
} = { current: { isConnected: false } };
const connectModalRef: {
  current: { openConnectModal?: () => void; connectModalOpen?: boolean };
} = { current: { openConnectModal: vi.fn(), connectModalOpen: false } };
const connectorsRef: { current: ReadonlyArray<{ id: string }> } = {
  current: [],
};
const connectMock = vi.fn();
const writeContractAsyncMock = vi.fn();
const resetWriteMock = vi.fn();
const waitForTransactionReceiptMock = vi.fn();
const getContractAddressMock = vi.fn<[number], `0x${string}` | null>();
const configMock = { uid: 'test-config' };

vi.mock('wagmi', () => ({
  useChainId: () => chainIdRef.current,
  useConfig: () => configMock,
  useAccount: () => accountRef.current,
  useConnect: () => ({
    connect: connectMock,
    connectors: connectorsRef.current,
  }),
  useWriteContract: () => ({
    writeContractAsync: writeContractAsyncMock,
    reset: resetWriteMock,
  }),
}));

vi.mock('@rainbow-me/rainbowkit', () => ({
  useConnectModal: () => connectModalRef.current,
}));

vi.mock('wagmi/actions', () => ({
  waitForTransactionReceipt: (...args: unknown[]) =>
    waitForTransactionReceiptMock(...args),
}));

vi.mock('../../src/config/chains', () => ({
  getNetwork: (chainId: number) => ({
    key: 'local' as const,
    chainId,
    rpcUrl: '',
    explorerAddressBase:
      chainId === 84532 ? 'https://sepolia.basescan.org/address/' : null,
    displayName: chainId === 84532 ? 'base sepolia' : 'unknown',
    buddyNft: getContractAddressMock(chainId),
    status: getContractAddressMock(chainId) === null ? 'not-yet-deployed' : 'deployed',
  }),
}));

import { BUDDY_NFT_ABI } from '../../src/config/contract';
import { useHatchFlow } from '../../src/lib/hatch';

const VALID_IDENTITY_HASH =
  '0x11c1f0ff5f3422e0e9c64abda3c02ca65cb05b5fe768946f7f3f7b89ae3667f6' as const;
const VALID_PRNG_SEED = 4_116_242_804;
const DEPLOYED_ADDRESS = '0x1f3a5e2b00000000000000000000000000000000' as const;
const WALLET_ADDRESS = '0xabcdef0123456789abcdef0123456789abcdef01' as const;
const TX_HASH = '0xabc1234567890000000000000000000000000000000000000000000000001234' as const;

let latestFlow: ReturnType<typeof useHatchFlow>;

function Probe(): JSX.Element {
  latestFlow = useHatchFlow(VALID_IDENTITY_HASH, VALID_PRNG_SEED);
  return (
    <button type="button" onClick={latestFlow.onRunHatch}>
      run {latestFlow.state.phase}
    </button>
  );
}

async function flushAsync(ticks = 6): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function awakenedReceipt(tokenId = 247n): unknown {
  const topics = encodeEventTopics({
    abi: BUDDY_NFT_ABI,
    eventName: 'Awakened',
    args: {
      tokenId,
      identityHash: VALID_IDENTITY_HASH,
      hatcher: WALLET_ADDRESS,
    },
  });
  return {
    status: 'success',
    logs: [{ data: '0x', topics }],
  };
}

function clickRun(): void {
  fireEvent.click(screen.getByRole('button', { name: /run/ }));
}

function applyDefaults(): void {
  chainIdRef.current = 84532;
  accountRef.current = { isConnected: false };
  connectModalRef.current = { openConnectModal: vi.fn(), connectModalOpen: false };
  connectorsRef.current = [];
  connectMock.mockReset();
  writeContractAsyncMock.mockReset();
  resetWriteMock.mockReset();
  waitForTransactionReceiptMock.mockReset();
  getContractAddressMock.mockReset();
  getContractAddressMock.mockReturnValue(DEPLOYED_ADDRESS);
}

describe('useHatchFlow', () => {
  beforeEach(applyDefaults);
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('connect → submit fires exactly once after the wallet connects', async () => {
    writeContractAsyncMock.mockResolvedValue(TX_HASH);
    waitForTransactionReceiptMock.mockRejectedValue({
      message: 'receipt wait intentionally stopped by test',
    });
    const { rerender } = render(<Probe />);

    act(() => clickRun());
    expect(connectModalRef.current.openConnectModal).toHaveBeenCalledTimes(1);
    expect(latestFlow.state.phase).toBe('connecting-wallet');
    expect(writeContractAsyncMock).not.toHaveBeenCalled();

    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    rerender(<Probe />);
    await flushAsync();

    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);
    expect(latestFlow.state.phase).toBe('failed');

    rerender(<Probe />);
    await flushAsync();
    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('receipt success confirms once and does not re-submit on later renders', async () => {
    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    writeContractAsyncMock.mockResolvedValue(TX_HASH);
    waitForTransactionReceiptMock.mockResolvedValue(awakenedReceipt());
    const { rerender, unmount } = render(<Probe />);

    act(() => clickRun());
    await flushAsync();

    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);
    expect(writeContractAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'hatch',
        args: [VALID_IDENTITY_HASH, VALID_PRNG_SEED],
      }),
    );
    expect(latestFlow.state).toMatchObject({
      phase: 'confirmed',
      txHash: TX_HASH,
      submissionChainId: 84532,
      tokenId: 247n,
    });

    rerender(<Probe />);
    await flushAsync();
    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);

    unmount();
    await flushAsync();
  });

  it('writeError user-rejected does not re-submit; retry produces a fresh single attempt', async () => {
    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    writeContractAsyncMock.mockRejectedValue({
      name: 'UserRejectedRequestError',
      message: 'User rejected the request.',
    });
    const { rerender } = render(<Probe />);

    act(() => clickRun());
    await flushAsync();
    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);
    expect(latestFlow.state).toMatchObject({
      phase: 'failed',
      category: 'user-rejected',
      txHash: null,
    });

    rerender(<Probe />);
    await flushAsync();
    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);

    act(() => clickRun());
    await flushAsync();
    expect(writeContractAsyncMock).toHaveBeenCalledTimes(2);
  });

  it('modal close without pick produces wallet-rejected and reverts STATUS ownership to ready-to-retry state', async () => {
    const { rerender } = render(<Probe />);

    act(() => clickRun());
    expect(latestFlow.state.phase).toBe('connecting-wallet');

    connectModalRef.current = {
      openConnectModal: connectModalRef.current.openConnectModal,
      connectModalOpen: true,
    };
    rerender(<Probe />);
    await flushAsync();
    expect(latestFlow.state.phase).toBe('connecting-wallet');

    connectModalRef.current = {
      openConnectModal: connectModalRef.current.openConnectModal,
      connectModalOpen: false,
    };
    rerender(<Probe />);
    await flushAsync();

    expect(latestFlow.state).toMatchObject({
      phase: 'failed',
      category: 'wallet-rejected',
      txHash: null,
      hadConnectStep: true,
    });
    expect(writeContractAsyncMock).not.toHaveBeenCalled();
  });

  it('no wallet connector and no modal produces wallet-not-found', async () => {
    connectModalRef.current = { openConnectModal: undefined, connectModalOpen: false };
    render(<Probe />);

    act(() => clickRun());
    await flushAsync();

    expect(latestFlow.state).toMatchObject({
      phase: 'failed',
      category: 'wallet-not-found',
      txHash: null,
      hadConnectStep: false,
    });
    expect(writeContractAsyncMock).not.toHaveBeenCalled();
  });

  it('no contract on the submit chain produces no-contract', async () => {
    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    getContractAddressMock.mockReturnValue(null);
    render(<Probe />);

    act(() => clickRun());
    await flushAsync();

    expect(latestFlow.state).toMatchObject({
      phase: 'failed',
      category: 'no-contract',
      txHash: null,
    });
    expect(writeContractAsyncMock).not.toHaveBeenCalled();
  });

  it('pins receipt wait and pending state to the submit-time chain', async () => {
    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    const receiptDeferred = deferred<unknown>();
    writeContractAsyncMock.mockResolvedValue(TX_HASH);
    waitForTransactionReceiptMock.mockReturnValue(receiptDeferred.promise);
    const { rerender } = render(<Probe />);

    act(() => clickRun());
    await flushAsync();

    expect(waitForTransactionReceiptMock).toHaveBeenCalledWith(configMock, {
      hash: TX_HASH,
      chainId: 84532,
    });
    expect(latestFlow.state).toMatchObject({
      phase: 'pending',
      txHash: TX_HASH,
      submissionChainId: 84532,
    });

    chainIdRef.current = 31337;
    getContractAddressMock.mockReturnValue(null);
    rerender(<Probe />);
    await flushAsync();

    expect(latestFlow.state).toMatchObject({
      phase: 'pending',
      submissionChainId: 84532,
    });
    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      receiptDeferred.resolve(awakenedReceipt());
    });
    await flushAsync();
  });

  it('event-parse-failed is emitted when a successful receipt lacks Awakened', async () => {
    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    writeContractAsyncMock.mockResolvedValue(TX_HASH);
    waitForTransactionReceiptMock.mockResolvedValue({ status: 'success', logs: [] });
    render(<Probe />);

    act(() => clickRun());
    await flushAsync();

    expect(latestFlow.state).toMatchObject({
      phase: 'failed',
      category: 'event-parse-failed',
      txHash: TX_HASH,
      submissionChainId: 84532,
    });
  });

  it.each([
    ['already-hatched', { cause: { data: { errorName: 'AlreadyHatched' } } }],
    ['wrong-network', { message: 'Wrong network: switch chain first' }],
    ['generic', { message: 'unknown provider failure' }],
  ] as const)('categorizes %s write failures', async (category, error) => {
    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    writeContractAsyncMock.mockRejectedValue(error);
    render(<Probe />);

    act(() => clickRun());
    await flushAsync();

    expect(latestFlow.state).toMatchObject({
      phase: 'failed',
      category,
      txHash: null,
    });
  });

  it('confirmed redirect countdown ticks from 5s to 0 without another write', async () => {
    vi.useFakeTimers();
    accountRef.current = { isConnected: true, address: WALLET_ADDRESS };
    writeContractAsyncMock.mockResolvedValue(TX_HASH);
    waitForTransactionReceiptMock.mockResolvedValue(awakenedReceipt());
    const { unmount } = render(<Probe />);

    act(() => clickRun());
    await flushAsync();
    expect(latestFlow.state).toMatchObject({ phase: 'confirmed', redirectIn: 5 });

    for (let i = 4; i >= 0; i--) {
      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });
      expect(latestFlow.state).toMatchObject({ phase: 'confirmed', redirectIn: i });
    }
    expect(writeContractAsyncMock).toHaveBeenCalledTimes(1);
    unmount();
  });

});

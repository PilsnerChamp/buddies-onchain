// Owns the full warm `/hatch` command lifecycle: wallet connect, transaction
// submission, receipt confirmation, normalized failures, and the post-
// confirmation redirect countdown. The route renders the returned state only;
// it does not couple wallet/modal state to transaction state.
//
// Chain-pinning: capture the active chain id at submit-time and pin both the
// contract address lookup and receipt wait to that chain. A retry re-enters
// the submit path and captures a fresh chain id.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { decodeEventLog, type Hex, type Log } from 'viem';
import { useAccount, useChainId, useConfig, useConnect, useWriteContract } from 'wagmi';

import { BUDDY_NFT_ABI } from '../config/contract';
import { getNetwork } from '../config/chains';
import { ACTIVE_NETWORK } from '../config/network';

const REDIRECT_COUNTDOWN_SECONDS = 5;
const IS_LOCAL_DEV = ACTIVE_NETWORK.key === 'local';

// Normalized hatch-failure categories. Route copy dispatches off this enum.
export type HatchErrorCategory =
  | 'user-rejected'
  | 'already-hatched'
  | 'invalid-uuid'
  | 'no-contract'
  | 'event-parse-failed'
  | 'wallet-not-found'
  | 'wallet-rejected'
  | 'wrong-network'
  | 'generic';

export type HatchState =
  | { phase: 'ready' }
  | { phase: 'connecting-wallet'; hadConnectStep: true }
  | { phase: 'submitting'; hadConnectStep: boolean; walletAddress?: string }
  | {
      phase: 'pending';
      txHash: Hex;
      submissionChainId: number;
      hadConnectStep: boolean;
      walletAddress?: string;
    }
  | {
      phase: 'confirmed';
      txHash: Hex;
      submissionChainId: number;
      tokenId: bigint;
      redirectIn: number;
      hadConnectStep: boolean;
      walletAddress?: string;
    }
  | {
      phase: 'failed';
      category: HatchErrorCategory;
      txHash: Hex | null;
      submissionChainId: number | null;
      raw: unknown;
      hadConnectStep: boolean;
      walletAddress?: string;
    };

type InternalHatchState =
  | { phase: 'ready'; runId: number; modalOpened: false }
  | {
      phase: 'connecting-wallet';
      runId: number;
      hadConnectStep: true;
      modalOpened: boolean;
    }
  | {
      phase: 'submitting';
      runId: number;
      hadConnectStep: boolean;
      walletAddress?: string;
      modalOpened: false;
    }
  | {
      phase: 'pending';
      runId: number;
      txHash: Hex;
      submissionChainId: number;
      hadConnectStep: boolean;
      walletAddress?: string;
      modalOpened: false;
    }
  | {
      phase: 'confirmed';
      runId: number;
      txHash: Hex;
      submissionChainId: number;
      tokenId: bigint;
      redirectIn: number;
      hadConnectStep: boolean;
      walletAddress?: string;
      modalOpened: false;
    }
  | {
      phase: 'failed';
      runId: number;
      category: HatchErrorCategory;
      txHash: Hex | null;
      submissionChainId: number | null;
      raw: unknown;
      hadConnectStep: boolean;
      walletAddress?: string;
      modalOpened: false;
    };

type HatchAction =
  | { type: 'begin-connect'; runId: number }
  | { type: 'modal-opened'; runId: number }
  | {
      type: 'begin-submit';
      runId: number;
      hadConnectStep: boolean;
      walletAddress?: string;
    }
  | {
      type: 'pending';
      runId: number;
      txHash: Hex;
      submissionChainId: number;
      hadConnectStep: boolean;
      walletAddress?: string;
    }
  | {
      type: 'confirmed';
      runId: number;
      txHash: Hex;
      submissionChainId: number;
      tokenId: bigint;
      hadConnectStep: boolean;
      walletAddress?: string;
    }
  | {
      type: 'failed';
      runId: number;
      category: HatchErrorCategory;
      txHash: Hex | null;
      submissionChainId: number | null;
      raw: unknown;
      hadConnectStep: boolean;
      walletAddress?: string;
    }
  | { type: 'redirect-tick'; runId: number };

function hatchReducer(
  state: InternalHatchState,
  action: HatchAction,
): InternalHatchState {
  if (action.type === 'begin-connect') {
    return {
      phase: 'connecting-wallet',
      runId: action.runId,
      hadConnectStep: true,
      modalOpened: false,
    };
  }

  if (action.type === 'begin-submit') {
    return {
      phase: 'submitting',
      runId: action.runId,
      hadConnectStep: action.hadConnectStep,
      walletAddress: action.walletAddress,
      modalOpened: false,
    };
  }

  if (action.runId !== state.runId) {
    // Direct connected-wallet runs can fail before `begin-submit` (for
    // example no contract on the submit-time chain). Accept the new run's
    // terminal failure while still ignoring stale completions from older
    // async work.
    if (action.type !== 'failed' || action.runId <= state.runId) {
      return state;
    }
  }

  switch (action.type) {
    case 'modal-opened':
      if (state.phase !== 'connecting-wallet') return state;
      if (state.modalOpened) return state;
      return { ...state, modalOpened: true };
    case 'pending':
      return {
        phase: 'pending',
        runId: action.runId,
        txHash: action.txHash,
        submissionChainId: action.submissionChainId,
        hadConnectStep: action.hadConnectStep,
        walletAddress: action.walletAddress,
        modalOpened: false,
      };
    case 'confirmed':
      return {
        phase: 'confirmed',
        runId: action.runId,
        txHash: action.txHash,
        submissionChainId: action.submissionChainId,
        tokenId: action.tokenId,
        redirectIn: REDIRECT_COUNTDOWN_SECONDS,
        hadConnectStep: action.hadConnectStep,
        walletAddress: action.walletAddress,
        modalOpened: false,
      };
    case 'failed':
      return {
        phase: 'failed',
        runId: action.runId,
        category: action.category,
        txHash: action.txHash,
        submissionChainId: action.submissionChainId,
        raw: action.raw,
        hadConnectStep: action.hadConnectStep,
        walletAddress: action.walletAddress,
        modalOpened: false,
      };
    case 'redirect-tick':
      if (state.phase !== 'confirmed' || state.redirectIn <= 0) return state;
      return { ...state, redirectIn: state.redirectIn - 1 };
    default:
      return state;
  }
}

function toPublicState(state: InternalHatchState): HatchState {
  switch (state.phase) {
    case 'ready':
      return { phase: 'ready' };
    case 'connecting-wallet':
      return { phase: 'connecting-wallet', hadConnectStep: true };
    case 'submitting':
      return {
        phase: 'submitting',
        hadConnectStep: state.hadConnectStep,
        walletAddress: state.walletAddress,
      };
    case 'pending':
      return {
        phase: 'pending',
        txHash: state.txHash,
        submissionChainId: state.submissionChainId,
        hadConnectStep: state.hadConnectStep,
        walletAddress: state.walletAddress,
      };
    case 'confirmed':
      return {
        phase: 'confirmed',
        txHash: state.txHash,
        submissionChainId: state.submissionChainId,
        tokenId: state.tokenId,
        redirectIn: state.redirectIn,
        hadConnectStep: state.hadConnectStep,
        walletAddress: state.walletAddress,
      };
    case 'failed':
      return {
        phase: 'failed',
        category: state.category,
        txHash: state.txHash,
        submissionChainId: state.submissionChainId,
        raw: state.raw,
        hadConnectStep: state.hadConnectStep,
        walletAddress: state.walletAddress,
      };
  }
}

function errorNamesFrom(err: unknown): string[] {
  const names: string[] = [];
  let cursor: unknown = err;
  for (let i = 0; i < 8 && cursor && typeof cursor === 'object'; i++) {
    const node = cursor as {
      name?: string;
      cause?: unknown;
      data?: { errorName?: string };
      details?: string;
      shortMessage?: string;
      message?: string;
    };
    if (node.name) names.push(node.name);
    if (node.data?.errorName) names.push(node.data.errorName);
    if (node.shortMessage) names.push(node.shortMessage);
    if (node.details) names.push(node.details);
    if (node.message) names.push(node.message);
    cursor = node.cause;
  }
  return names.map((entry) => entry.toLowerCase());
}

// Inspects viem/wallet errors and categorizes them. Wallet and RPC
// providers vary in how much typed detail they preserve, so this uses typed
// sentinels first and string sniffing last.
function categorizeWriteError(err: unknown): HatchErrorCategory {
  const names = errorNamesFrom(err);
  if (
    names.some(
      (entry) =>
        entry.includes('userrejectedrequesterror') ||
        entry.includes('user rejected') ||
        entry.includes('user denied') ||
        entry.includes('rejected the request') ||
        entry.includes('rejected request'),
    )
  ) {
    return 'user-rejected';
  }
  if (names.some((entry) => entry.includes('alreadyhatched'))) {
    return 'already-hatched';
  }
  if (names.some((entry) => entry.includes('invaliduuidformat'))) {
    return 'invalid-uuid';
  }
  if (
    names.some(
      (entry) =>
        entry.includes('wrong network') ||
        entry.includes('unsupported chain') ||
        entry.includes('chain mismatch') ||
        entry.includes('switch chain') ||
        entry.includes('chain id'),
    )
  ) {
    return 'wrong-network';
  }
  return 'generic';
}

// Extracts the `tokenId` from the `Awakened` event log via viem's
// `decodeEventLog`. Returns `null` if no well-formed `Awakened` log is
// present.
function extractAwakenedTokenId(logs: readonly Log[]): bigint | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: BUDDY_NFT_ABI,
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      if (decoded.eventName === 'Awakened') {
        const tokenId = (decoded.args as { tokenId?: bigint }).tokenId;
        if (typeof tokenId === 'bigint') return tokenId;
      }
    } catch {
      // Non-Awakened log; continue.
    }
  }
  return null;
}

export function useHatchFlow(accountUuid: string): {
  state: HatchState;
  onRunHatch: () => void;
  activeChainId: number;
  isConnected: boolean;
  walletAddress: string | null;
} {
  const activeChainId = useChainId();
  const config = useConfig();
  const { isConnected, address } = useAccount();
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const { connect, connectors } = useConnect();
  const { writeContractAsync, reset: resetWrite } = useWriteContract();

  const [internalState, dispatch] = useReducer(hatchReducer, {
    phase: 'ready',
    runId: 0,
    modalOpened: false,
  });
  const nextRunIdRef = useRef(0);
  const startedSubmitRunIdsRef = useRef(new Set<number>());

  const walletAddress = address ?? null;
  const metaMaskConnector = connectors.find((connector) => connector.id === 'metaMask');

  const triggerConnect = useCallback((): boolean => {
    if (IS_LOCAL_DEV && metaMaskConnector) {
      connect({ connector: metaMaskConnector });
      return true;
    }
    if (openConnectModal) {
      openConnectModal();
      return true;
    }
    return false;
  }, [connect, metaMaskConnector, openConnectModal]);

  const startSubmit = useCallback(
    (
      runId: number,
      hadConnectStep: boolean,
      submittingWalletAddress?: string,
    ): void => {
      if (startedSubmitRunIdsRef.current.has(runId)) return;
      startedSubmitRunIdsRef.current.add(runId);

      const pinnedChainId = activeChainId;
      const pinnedAddress = getNetwork(pinnedChainId)?.buddyNft ?? null;
      if (pinnedAddress === null) {
        dispatch({
          type: 'failed',
          runId,
          category: 'no-contract',
          txHash: null,
          submissionChainId: null,
          raw: { reason: 'no-contract-on-chain', chainId: pinnedChainId },
          hadConnectStep,
          walletAddress: submittingWalletAddress,
        });
        return;
      }

      resetWrite();
      dispatch({
        type: 'begin-submit',
        runId,
        hadConnectStep,
        walletAddress: submittingWalletAddress,
      });

      void (async () => {
        let txHash: Hex | null = null;
        try {
          txHash = await writeContractAsync({
            abi: BUDDY_NFT_ABI,
            address: pinnedAddress,
            chainId: pinnedChainId,
            functionName: 'hatch',
            args: [accountUuid],
          });
          dispatch({
            type: 'pending',
            runId,
            txHash,
            submissionChainId: pinnedChainId,
            hadConnectStep,
            walletAddress: submittingWalletAddress,
          });

          const receipt = await waitForTransactionReceipt(config, {
            hash: txHash,
            chainId: pinnedChainId,
          });
          if (receipt.status !== 'success') {
            dispatch({
              type: 'failed',
              runId,
              category: 'generic',
              txHash,
              submissionChainId: pinnedChainId,
              raw: { reason: 'tx-reverted', receipt },
              hadConnectStep,
              walletAddress: submittingWalletAddress,
            });
            return;
          }

          const tokenId = extractAwakenedTokenId(receipt.logs);
          if (tokenId === null) {
            dispatch({
              type: 'failed',
              runId,
              category: 'event-parse-failed',
              txHash,
              submissionChainId: pinnedChainId,
              raw: { reason: 'no-awakened-event', receipt },
              hadConnectStep,
              walletAddress: submittingWalletAddress,
            });
            return;
          }

          dispatch({
            type: 'confirmed',
            runId,
            txHash,
            submissionChainId: pinnedChainId,
            tokenId,
            hadConnectStep,
            walletAddress: submittingWalletAddress,
          });
        } catch (err) {
          dispatch({
            type: 'failed',
            runId,
            category: categorizeWriteError(err),
            txHash,
            submissionChainId: txHash === null ? null : pinnedChainId,
            raw: err,
            hadConnectStep,
            walletAddress: submittingWalletAddress,
          });
        }
      })();
    },
    [accountUuid, activeChainId, config, resetWrite, writeContractAsync],
  );

  const onRunHatch = useCallback((): void => {
    const runId = nextRunIdRef.current + 1;
    nextRunIdRef.current = runId;

    if (isConnected) {
      startSubmit(runId, false, walletAddress ?? undefined);
      return;
    }

    dispatch({ type: 'begin-connect', runId });
    try {
      if (!triggerConnect()) {
        dispatch({
          type: 'failed',
          runId,
          category: 'wallet-not-found',
          txHash: null,
          submissionChainId: null,
          raw: { reason: 'no-connect-provider' },
          hadConnectStep: false,
        });
      }
    } catch (err) {
      dispatch({
        type: 'failed',
        runId,
        category: 'generic',
        txHash: null,
        submissionChainId: null,
        raw: err,
        hadConnectStep: true,
      });
    }
  }, [isConnected, startSubmit, triggerConnect, walletAddress]);

  // Post-connect handoff. This is keyed to the explicit
  // `connecting-wallet` phase, not to a transient "idle" state, so receipt
  // success/failure renders cannot re-enter submission.
  useEffect(() => {
    if (internalState.phase !== 'connecting-wallet') return;
    if (!isConnected) return;
    startSubmit(internalState.runId, true, walletAddress ?? undefined);
  }, [internalState, isConnected, startSubmit, walletAddress]);

  // RainbowKit modal close without a wallet selection → wallet-rejected.
  // The `modalOpened` latch prevents a false failure on the render before
  // RainbowKit has actually opened its dialog.
  useEffect(() => {
    if (internalState.phase !== 'connecting-wallet') return;
    if (connectModalOpen) {
      dispatch({ type: 'modal-opened', runId: internalState.runId });
      return;
    }
    if (internalState.modalOpened && !isConnected) {
      dispatch({
        type: 'failed',
        runId: internalState.runId,
        category: 'wallet-rejected',
        txHash: null,
        submissionChainId: null,
        raw: { reason: 'connect-modal-closed' },
        hadConnectStep: true,
      });
    }
  }, [connectModalOpen, internalState, isConnected]);

  const redirectIn =
    internalState.phase === 'confirmed' ? internalState.redirectIn : null;
  useEffect(() => {
    if (internalState.phase !== 'confirmed' || redirectIn === null) return;
    if (redirectIn <= 0) return;
    const id = window.setTimeout(() => {
      dispatch({ type: 'redirect-tick', runId: internalState.runId });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [internalState.phase, internalState.runId, redirectIn]);

  const state = useMemo(() => toPublicState(internalState), [internalState]);

  return {
    state,
    onRunHatch,
    activeChainId,
    isConnected,
    walletAddress,
  };
}

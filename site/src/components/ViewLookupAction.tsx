// site/src/components/ViewLookupAction.tsx
//
// Dual-grammar lookup prompt for the unified `/view` console (bare `/view`
// and the `/view/<tokenId>` miss state render the same console; STATUS is
// the only difference). One input, two argument shapes, detected by form —
// zero ambiguity:
//
//   > /view [<token-id> | <account-uuid>] ▊
//
//   - all digits        → token id (public, sequential, browsable)
//   - 8-4-4-4-12 hex    → account UUID (resolves only the holder's own buddy)
//
// A buddy answers to both keys on-chain (sequential id + identity hash via
// getTokenIdByIdentity), so the prompt exposes both through one slot. The
// SYNOPSIS line is the whole affordance — no auto-detect helper copy, no
// privacy-reassurance toast (declarative register).
//
// One warn slot, two sync messages (both replay via `warnKey` remount):
//   - `! enter a valid token id or account uuid` — empty / malformed input
//     on attempt, or live while a malformed value is typed.
//   - `! not found — try a different token id` — the submitted id is a known
//     miss: either it equals `currentTokenId` (this console IS its miss
//     result, so re-submitting navigates nowhere — warn in place), or the
//     console mounted from a retry navigation that landed on another miss
//     (`showNotFoundOnMount`, router-state driven). Without this, a retry
//     that misses re-renders a near-identical card and reads as "nothing
//     happened".
// Typing clears the sticky warn — the user is acting on it. Async UUID
// lookup feedback (looking up / miss / pre-deploy) is the owner's line,
// rendered below; `onInputChange` lets the owner reset it on typing so the
// two feedback sources never describe different attempts at once.
//
// Whole-row click model (mirrors cold's `> claude ▊` button):
//   - The `.view-action` wrapper is the click target; input clicks stop
//     propagation so typing-clicks focus without firing a submit attempt.
//   - Failed attempt → warn line re-mounts via `warnKey` bump (CSS fade-in
//     replays from frame 0) and the input refocuses.
//   - Valid token id (not the current miss) → `onValidTokenId`.
//   - Valid UUID → `onValidUuid` (owner resolves client-side; the UUID
//     never enters a URL).
//   - Enter inside the input submits via the wrapping `<form>` for
//     keyboard parity.

import { useRef, useState, type FormEvent, type MouseEvent } from 'react';

import { isValidUuid } from '~shared/isValidUuid';
import { parseTokenId } from '../lib/parseTokenId';

const INPUT_PLACEHOLDER = '<token-id> | <account-uuid>';

type WarnKind = 'invalid' | 'not-found';

const WARN_COPY: Record<WarnKind, string> = {
  invalid: '! enter a valid token id or account uuid',
  'not-found': '! not found — try a different token id',
};

export function ViewLookupAction({
  onValidTokenId,
  onValidUuid,
  onInputChange,
  currentTokenId,
  showNotFoundOnMount = false,
}: {
  onValidTokenId: (tokenId: bigint) => void;
  onValidUuid: (uuid: string) => void;
  // Fires on every keystroke — owners reset async lookup feedback here.
  onInputChange?: () => void;
  // The token id this console already proved nonexistent — re-submitting it
  // warns in place instead of navigating to the same URL.
  currentTokenId?: bigint;
  // Mount with the not-found warn visible (set from router state when a
  // retry navigation landed on another miss).
  showNotFoundOnMount?: boolean;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [input, setInput] = useState('');
  const [warn, setWarn] = useState<WarnKind | null>(
    showNotFoundOnMount ? 'not-found' : null,
  );
  const [warnKey, setWarnKey] = useState(0);

  const normalized = input.trim();
  const lowered = normalized.toLowerCase();
  const tokenId = parseTokenId(normalized);
  const isUuid = isValidUuid(lowered);
  const canSubmit = tokenId !== null || isUuid;
  const isInvalid = normalized !== '' && !canSubmit;
  // Live invalid feedback while typing wins the slot; otherwise the sticky
  // post-attempt warn holds it.
  const activeWarn: WarnKind | null = isInvalid ? 'invalid' : warn;

  const raiseWarn = (kind: WarnKind): void => {
    setWarn(kind);
    setWarnKey((k) => k + 1);
    inputRef.current?.focus();
  };

  const attemptLookup = (): void => {
    if (!canSubmit) {
      raiseWarn('invalid');
      return;
    }
    if (tokenId !== null) {
      if (currentTokenId !== undefined && tokenId === currentTokenId) {
        raiseWarn('not-found');
        return;
      }
      onValidTokenId(tokenId);
      return;
    }
    onValidUuid(lowered);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    attemptLookup();
  };

  const handleRowClick = (): void => {
    attemptLookup();
  };

  const handleInputClick = (event: MouseEvent<HTMLInputElement>): void => {
    // Stop the click from bubbling to the row's `onClick` so typing-
    // clicks just focus the input rather than firing a submit attempt.
    event.stopPropagation();
  };

  return (
    <>
      <form className="view-action-form" onSubmit={handleSubmit} noValidate>
        {/* Hidden label keeps the screen-reader hook for the input while
            the visible UI presents the field as inline terminal text
            (sigil + cmd + bracketed input + cursor block). */}
        <label htmlFor="view-action-input" className="view-action__sr-only">
          token-id or account-uuid
        </label>
        {/*
          The row is a mouse click target — `onClick` triggers a lookup
          attempt regardless of validity. NO `role="button"` / `tabIndex`
          / `aria-label` on the wrapper: nesting a labelled `<input>` +
          submit `<button>` inside a button-role widget creates ambiguous
          SR semantics. Keyboard users get full parity via the input's own
          focus + form Enter submit + the sr-only submit button.
        */}
        <div
          className="terminal-action-row view-action hover-row"
          onClick={handleRowClick}
        >
          <span className="view-action__sigil hover-row__sigil">&gt;</span>{' '}
          <span className="view-action__command hover-row__key">/view</span>{' '}
          <span className="view-action__bracket">[</span>
          <input
            id="view-action-input"
            ref={inputRef}
            className="view-action__input"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={INPUT_PLACEHOLDER}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (warn !== null) setWarn(null);
              onInputChange?.();
            }}
            onClick={handleInputClick}
            aria-invalid={activeWarn === 'invalid'}
            aria-describedby={
              activeWarn !== null ? 'view-action-warn' : undefined
            }
          />
          <span className="view-action__bracket">]</span>{' '}
          <span className="blinking-cursor__block" aria-hidden="true" />
        </div>
        {/* Hidden submit button so the form still submits reliably on
            Enter inside the input — Safari historically requires an
            explicit submit element on single-input forms. */}
        <button
          type="submit"
          className="view-action__sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          submit
        </button>
      </form>
      {activeWarn !== null && (
        <p
          id="view-action-warn"
          key={`${activeWarn}-${warnKey}`}
          className="view-action__warn"
          role="alert"
        >
          {WARN_COPY[activeWarn]}
        </p>
      )}
    </>
  );
}

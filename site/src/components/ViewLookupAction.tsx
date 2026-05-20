// site/src/components/ViewLookupAction.tsx
//
// Shared action-prompt input for `/view` (bare) and `/view/<uuid>`
// (miss card). Same UX on both: paste an account UUID, click the row
// (or press Enter), navigate to `/view/<new-uuid>`. Lives as a shared
// component so the per-route surfaces stay consistent — every
// actionable view surface renders an action prompt slot after NEXT
// STEPS, before the rail.
//
// Whole-row click model (mirrors cold's `> claude ▊` button):
//   - The `.view-action` wrapper is the click target. Click anywhere in
//     the row triggers a lookup attempt.
//   - Click on the inner `<input>` does NOT bubble to the row (stop-
//     propagation), so typing-clicks focus the input without firing a
//     premature submit.
//   - Empty / invalid input + click → error line `! enter a valid
//     account uuid` re-mounts via `errorKey` bump (CSS opacity fade-in
//     replays from frame 0) and the input is focused so the user can
//     fix the value.
//   - Valid input + click → navigate.
//   - Enter inside the input still submits via the wrapping `<form>`
//     for keyboard parity.

import { useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { viewUuidPath } from '../config/routes';
import { isValidUuid } from '~shared/isValidUuid';

const UUID_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

export function ViewLookupAction(): JSX.Element {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [input, setInput] = useState('');
  // Tracks whether the user has clicked / submitted at least once. Once
  // true, we surface the error line on empty input as well so a click
  // on an empty row gets visible feedback (lookup-attempt rules are
  // unified across whole-row click + Enter inside the input).
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Bumped on every failed attempt — used as the error `<p>`'s React
  // key so the element remounts and the CSS fade-in keyframe replays.
  // Mirrors `replayKey` from cold-hero's walkthrough remount idiom.
  const [errorKey, setErrorKey] = useState(0);

  const normalized = input.trim().toLowerCase();
  const isInvalid = normalized !== '' && !isValidUuid(normalized);
  const canSubmit = normalized !== '' && !isInvalid;
  // Show the warn line if the user has typed an invalid value at any
  // point, OR if they've attempted submit on an empty value.
  const showError = isInvalid || (submitAttempted && !canSubmit);

  const attemptLookup = (): void => {
    if (canSubmit) {
      navigate(viewUuidPath(normalized));
      return;
    }
    setSubmitAttempted(true);
    setErrorKey((k) => k + 1);
    inputRef.current?.focus();
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
    // clicks just focus the input (default browser behaviour) rather
    // than firing a submit attempt.
    event.stopPropagation();
  };

  return (
    <>
      <form className="view-action-form" onSubmit={handleSubmit} noValidate>
        {/* Hidden label keeps the screen-reader hook for the input
            while the visible UI presents the field as inline terminal
            text (sigil + cmd + bracketed input + cursor block). */}
        <label htmlFor="view-action-input" className="view-action__sr-only">
          account-uuid
        </label>
        {/*
          The row is a mouse click target — `onClick` triggers a lookup
          attempt regardless of validity, mirroring cold's `> claude ▊`
          button replay-on-click. NO `role="button"` / `tabIndex={0}` /
          `aria-label` on the wrapper: nesting a labelled `<input>` +
          submit `<button>` inside a button-role widget creates
          ambiguous SR semantics. Keyboard users get full parity via
          the input's own focus + form Enter submit + the sr-only
          submit button. Clicks on the input stop propagation so they
          only focus, never submit.
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
            placeholder={UUID_PLACEHOLDER}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onClick={handleInputClick}
            aria-invalid={isInvalid}
            aria-describedby={showError ? 'view-action-warn' : undefined}
          />
          <span className="view-action__bracket">]</span>{' '}
          <span className="blinking-cursor__block" aria-hidden="true" />
        </div>
        {/* Hidden submit button so the form still submits reliably on
            Enter inside the input — Safari historically requires an
            explicit submit element on single-input forms. CSS hides it
            visually; keyboard Enter still fires the form's onSubmit. */}
        <button
          type="submit"
          className="view-action__sr-only"
          tabIndex={-1}
          aria-hidden="true"
        >
          submit
        </button>
      </form>
      {showError && (
        <p
          id="view-action-warn"
          key={errorKey}
          className="view-action__warn"
          role="alert"
        >
          ! enter a valid account uuid
        </p>
      )}
    </>
  );
}

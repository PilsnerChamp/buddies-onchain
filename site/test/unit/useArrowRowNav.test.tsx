import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { useArrowRowNav } from '../../src/lib/useArrowRowNav';

function HookHarness({ children }: { children: ReactNode }): JSX.Element {
  useArrowRowNav();
  return <>{children}</>;
}

function renderNav(children: ReactNode): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <HookHarness>{children}</HookHarness>
    </MemoryRouter>,
  );
}

function basicRows(): JSX.Element {
  return (
    <>
      <a href="#first" className="hover-row" data-testid="first">
        first
      </a>
      <a href="#second" className="hover-row" data-testid="second">
        second
      </a>
      <a href="#third" className="hover-row" data-testid="third">
        third
      </a>
    </>
  );
}

function activeElement(): Element | null {
  return document.activeElement;
}

afterEach(() => {
  cleanup();
});

describe('useArrowRowNav', () => {
  it('moves down from no row focus to the first row', () => {
    renderNav(basicRows());

    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(activeElement()).toBe(screen.getByTestId('first'));
  });

  it('moves up from no row focus to the last row', () => {
    renderNav(basicRows());

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(activeElement()).toBe(screen.getByTestId('third'));
  });

  it('wraps down from the last row to the first row', () => {
    renderNav(basicRows());
    screen.getByTestId('third').focus();

    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(activeElement()).toBe(screen.getByTestId('first'));
  });

  it('wraps up from the first row to the last row', () => {
    renderNav(basicRows());
    screen.getByTestId('first').focus();

    fireEvent.keyDown(window, { key: 'ArrowUp' });

    expect(activeElement()).toBe(screen.getByTestId('third'));
  });

  it('skips inert hover rows', () => {
    renderNav(
      <>
        <a href="#first" className="hover-row" data-testid="first">
          first
        </a>
        <a
          href="#inert"
          className="hover-row hover-row--inert"
          data-testid="inert"
        >
          inert
        </a>
        <a href="#third" className="hover-row" data-testid="third">
          third
        </a>
      </>,
    );
    screen.getByTestId('first').focus();

    fireEvent.keyDown(window, { key: 'ArrowDown' });

    expect(activeElement()).toBe(screen.getByTestId('third'));
  });

  it('navigates out of the view UUID input on vertical arrows', () => {
    renderNav(
      <>
        <div className="view-action hover-row" data-testid="view-row">
          <input className="view-action__input" data-testid="uuid-input" />
        </div>
        <a href="#next" className="hover-row" data-testid="next">
          next
        </a>
      </>,
    );
    screen.getByTestId('uuid-input').focus();

    fireEvent.keyDown(screen.getByTestId('uuid-input'), { key: 'ArrowDown' });

    expect(activeElement()).toBe(screen.getByTestId('next'));
  });

  it('ignores Alt, Meta, and Ctrl arrow combinations', () => {
    renderNav(basicRows());
    const first = screen.getByTestId('first');
    first.focus();

    fireEvent.keyDown(window, { key: 'ArrowDown', altKey: true });
    expect(activeElement()).toBe(first);

    fireEvent.keyDown(window, { key: 'ArrowDown', metaKey: true });
    expect(activeElement()).toBe(first);

    fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
    expect(activeElement()).toBe(first);
  });

  it('does not navigate from a textarea', () => {
    renderNav(
      <>
        <textarea data-testid="textarea" />
        <a href="#first" className="hover-row" data-testid="first">
          first
        </a>
      </>,
    );
    screen.getByTestId('textarea').focus();

    fireEvent.keyDown(screen.getByTestId('textarea'), { key: 'ArrowDown' });

    expect(activeElement()).toBe(screen.getByTestId('textarea'));
  });

  it('does not navigate from contenteditable text', () => {
    renderNav(
      <>
        <div
          contentEditable
          suppressContentEditableWarning
          tabIndex={0}
          data-testid="editor"
        >
          edit
        </div>
        <a href="#first" className="hover-row" data-testid="first">
          first
        </a>
      </>,
    );
    screen.getByTestId('editor').focus();

    fireEvent.keyDown(screen.getByTestId('editor'), { key: 'ArrowDown' });

    expect(activeElement()).toBe(screen.getByTestId('editor'));
  });
});

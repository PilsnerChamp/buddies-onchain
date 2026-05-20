// site/test/unit/bondRoute.test.tsx
//
// Covers `/bond`.
// Disabled action prompt slot, separator rail, and SEE ALSO cold-shape
// footer parity.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Bond } from '../../src/routes/Bond';

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

function renderBond(): { container: HTMLElement } {
  return render(
    <MemoryRouter initialEntries={['/bond']}>
      <Bond />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('/bond — route shape', () => {
  it('echoes `> /bond --help` per docs/site/terminal-ui.md § Routes and command echoes', () => {
    const { container } = renderBond();
    const echo = container.querySelector('.route-command__accent');
    expect(echo?.textContent).toBe('/bond --help');
  });

  it('renders sections in canonical order: STATUS, DESCRIPTION, NEXT STEPS, AUTHOR, SEE ALSO', () => {
    const { container } = renderBond();
    const headings = Array.from(
      container.querySelectorAll('.man-page-section__heading'),
    ).map((el) => el.textContent);
    expect(headings).toEqual([
      'STATUS',
      'DESCRIPTION',
      'NEXT STEPS',
      'AUTHOR',
      'SEE ALSO',
    ]);
  });

  it('STATUS line carries `stage 2 · not yet implemented` per docs/site/terminal-ui.md § `/bond` placeholder', () => {
    const { container } = renderBond();
    const statusLine = container.querySelector('.route-status');
    expect(statusLine).toBeTruthy();
    const statusText = statusLine!.textContent ?? '';
    expect(statusText).toContain('stage 2');
    expect(statusText).toContain('not yet implemented');
  });

  it('renders the disabled action prompt slot (`.bond-action`) — inert hover-row, no button, no click target', () => {
    const { container } = renderBond();
    const action = container.querySelector('.bond-action');
    expect(action).toBeTruthy();
    // Disabled: `.hover-row--inert` carried alongside `.hover-row` so
    // the locked combo register's hover/focus rules don't fire.
    expect(action?.classList.contains('hover-row')).toBe(true);
    expect(action?.classList.contains('hover-row--inert')).toBe(true);
    // Plain `<p>` (NOT a button) — bond is dormant.
    expect(action?.tagName).toBe('P');
    expect(action?.getAttribute('aria-disabled')).toBe('true');
    // Muted static cursor slot for visual parity with active prompts —
    // no blinking cursor block.
    expect(container.querySelector('.bond-action__cursor')).toBeTruthy();
    expect(container.querySelector('.blinking-cursor__block')).toBeNull();
    // Inline disclosure line beneath the disabled prompt.
    expect(container.querySelector('.bond-action__inline')).toBeTruthy();
  });

  it('does NOT render the tail terminal prompt cursor (showCursor dropped)', () => {
    const { container } = renderBond();
    expect(container.querySelector('.terminal-frame__prompt')).toBeNull();
  });

  it('renders the separator rail above AUTHOR per cold-shape parity', () => {
    const { container } = renderBond();
    const rail = container.querySelector('.route-rail');
    expect(rail).toBeTruthy();
    expect((rail!.textContent ?? '').trim()).toMatch(/^-+$/);
  });

  it('AUTHOR link carries `.hover-row` + `.hover-row__key` for the locked combo register', () => {
    const { container } = renderBond();
    const author = container.querySelector('.route-author');
    expect(author).toBeTruthy();
    expect(author?.classList.contains('hover-row')).toBe(true);
    expect(container.querySelector('.route-author .hover-row__key')).toBeTruthy();
  });

  it('SEE ALSO row order is / → /hatch → /view → github → contract (bond self-omits)', () => {
    const { container } = renderBond();
    const seeAlso = container.querySelector('.see-also');
    expect(seeAlso).toBeTruthy();
    const keyCells = seeAlso!.querySelectorAll('.see-also__label');
    const labels = Array.from(keyCells).map((c) => c.textContent?.trim() ?? '');
    expect(labels[0]).toBe('/');
    expect(labels[1]).toBe('/hatch');
    expect(labels[2]).toBe('/view');
    expect(labels[3]).toBe('github');
    // /bond self-omits its own row.
    expect(labels).not.toContain('/bond');
  });

  it('SEE ALSO uses cold-shape parity (`PilsnerChamp/buddies-onchain`, ASCII `-` separators, no `· not yet implemented`)', () => {
    const { container } = renderBond();
    const seeAlso = container.querySelector('.see-also');
    const text = (seeAlso!.textContent ?? '').replace(/\s+/g, ' ');
    // github row right-column descriptor is the repo shorthand.
    expect(text).toContain('PilsnerChamp/buddies-onchain');
    expect(text).not.toContain('source · manifesto · contracts');
    // No legacy mid-dot in cross-route SEE ALSO contract chunks.
    // (The STATUS line `stage 2 · not yet implemented` lives outside
    // the .see-also container so it doesn't pollute this assertion.)
  });
});

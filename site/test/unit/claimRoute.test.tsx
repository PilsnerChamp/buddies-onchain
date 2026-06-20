// site/test/unit/claimRoute.test.tsx
//
// Covers `/claim`.
// Disabled action prompt slot, separator rail, and SEE ALSO cold-shape
// footer parity.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Claim } from '../../src/routes/Claim';

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

function renderClaim(): { container: HTMLElement } {
  return render(
    <MemoryRouter initialEntries={['/claim']}>
      <Claim />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('/claim — route shape', () => {
  it('echoes `> /claim --help` per docs/site/terminal-ui.md § Routes and command echoes', () => {
    const { container } = renderClaim();
    const echo = container.querySelector('.route-command__accent');
    expect(echo?.textContent).toBe('/claim --help');
  });

  it('renders sections in canonical order: STATUS, DESCRIPTION, NEXT STEPS, AUTHOR, SEE ALSO', () => {
    const { container } = renderClaim();
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

  it('STATUS line carries `stage 2 · not yet implemented` per docs/site/terminal-ui.md § `/claim` placeholder', () => {
    const { container } = renderClaim();
    const statusLine = container.querySelector('.route-status');
    expect(statusLine).toBeTruthy();
    const statusText = statusLine!.textContent ?? '';
    expect(statusText).toContain('stage 2');
    expect(statusText).toContain('not yet implemented');
  });

  it('renders the disabled action prompt slot (`.claim-action`) — inert hover-row, no button, no click target', () => {
    const { container } = renderClaim();
    const action = container.querySelector('.claim-action');
    expect(action).toBeTruthy();
    // Disabled: `.hover-row--inert` carried alongside `.hover-row` so
    // the locked combo register's hover/focus rules don't fire.
    expect(action?.classList.contains('hover-row')).toBe(true);
    expect(action?.classList.contains('hover-row--inert')).toBe(true);
    // Plain `<p>` (NOT a button) — claim is dormant.
    expect(action?.tagName).toBe('P');
    expect(action?.getAttribute('aria-disabled')).toBe('true');
    // Muted static cursor slot for visual parity with active prompts —
    // no blinking cursor block.
    expect(container.querySelector('.claim-action__cursor')).toBeTruthy();
    expect(container.querySelector('.blinking-cursor__block')).toBeNull();
    // Inline disclosure line beneath the disabled prompt.
    expect(container.querySelector('.claim-action__inline')).toBeTruthy();
  });

  it('does NOT render the tail terminal prompt cursor (showCursor dropped)', () => {
    const { container } = renderClaim();
    expect(container.querySelector('.terminal-frame__prompt')).toBeNull();
  });

  it('renders the separator rail above AUTHOR per cold-shape parity', () => {
    const { container } = renderClaim();
    const rail = container.querySelector('.route-rail');
    expect(rail).toBeTruthy();
    expect((rail!.textContent ?? '').trim()).toMatch(/^-+$/);
  });

  it('AUTHOR link carries `.hover-row` + `.hover-row__key` for the locked combo register', () => {
    const { container } = renderClaim();
    const author = container.querySelector('.route-author');
    expect(author).toBeTruthy();
    expect(author?.classList.contains('hover-row')).toBe(true);
    expect(container.querySelector('.route-author .hover-row__key')).toBeTruthy();
  });

  it('SEE ALSO row order is / → /hatch → /view → github → contract (claim self-omits)', () => {
    const { container } = renderClaim();
    const seeAlso = container.querySelector('.see-also');
    expect(seeAlso).toBeTruthy();
    const keyCells = seeAlso!.querySelectorAll('.see-also__label');
    const labels = Array.from(keyCells).map((c) => c.textContent?.trim() ?? '');
    expect(labels[0]).toBe('/');
    expect(labels[1]).toBe('/hatch');
    expect(labels[2]).toBe('/view');
    expect(labels[3]).toBe('github');
    // /claim self-omits its own row.
    expect(labels).not.toContain('/claim');
  });

  it('SEE ALSO uses cold-shape parity (`PilsnerChamp/buddies-onchain`, ASCII `-` separators, no `· not yet implemented`)', () => {
    const { container } = renderClaim();
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

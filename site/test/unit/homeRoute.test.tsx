// site/test/unit/homeRoute.test.tsx
//
// Covers the canonical cold-landing surface.
//
// Asserts the canonical surface: section list (NAME, DESCRIPTION,
// NEXT STEP, AUTHOR, SEE ALSO — STATUS and REQUIREMENTS deliberately
// absent on cold), NEXT STEP body copy, hero terminal (autofocused
// button + walkthrough lines using ASCII arrows + inline wallet hint),
// separator rail, ASCII separators on SEE ALSO, no tail prompt cursor,
// and replay behavior (DOM remount on click).
//
// Animation strategy: a `prefers-reduced-motion: reduce` matchMedia
// stub forces ColdHeroTerminal's CSS to short-circuit to instant
// render, so walkthrough text is in the DOM at assertion time without
// fake-timer choreography.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// jsdom does not ship `matchMedia`. ColdHeroTerminal's typewriter is CSS-
// driven, so the JS path doesn't read it directly — but App-level
// components (e.g. DotGridBackground) do, and a missing global throws.
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

import { Home } from '../../src/routes/Home';
import {
  PLUGIN_INSTALL_COMMAND,
  PLUGIN_MARKETPLACE_ADD_COMMAND,
} from '../../src/lib/pluginCommands';

function renderHome(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Home />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe('Home (cold landing) — canonical man-page shape', () => {
  it('renders sections in canonical order — STATUS and REQUIREMENTS deliberately absent on cold', () => {
    renderHome();
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.trim());
    expect(headings).toEqual([
      'NAME',
      'DESCRIPTION',
      'NEXT STEP',
      'AUTHOR',
      'SEE ALSO',
    ]);
    // Defense-in-depth: explicit absence assertions so an accidental
    // future re-add fails this test.
    expect(screen.queryByRole('heading', { level: 2, name: 'STATUS' })).toBeNull();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'REQUIREMENTS' }),
    ).toBeNull();
  });

  it('NAME line drops "preserve" and uses ASCII hyphen separator', () => {
    renderHome();
    const heading = screen.getByRole('heading', { level: 2, name: 'NAME' });
    const section = heading.closest('section');
    const text = (section!.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(text).toContain('/buddy-onchain - hatch your buddy onchain.');
    expect(text).not.toContain('preserve');
  });

  it('NEXT STEP heading is singular and body is the canonical single sentence', () => {
    renderHome();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'NEXT STEPS' }),
    ).toBeNull();
    const heading = screen.getByRole('heading', { level: 2, name: 'NEXT STEP' });
    const section = heading.closest('section');
    const text = (section!.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(text).toContain(
      'Run claude in your terminal and install the buddy-onchain plugin.',
    );
  });

  it('action prompt is a focusable button with `claude` accessible name', () => {
    renderHome();
    const button = screen.getByRole('button', { name: /claude/i });
    expect(button).toBeTruthy();
    // autoFocus places focus on the button after mount.
    expect(document.activeElement).toBe(button);
  });

  it('walkthrough renders canonical install commands with ASCII outcome arrows + inline wallet hint', () => {
    renderHome();
    const walkthrough = screen.getByTestId('cold-hero-walkthrough');
    const text = walkthrough.textContent ?? '';
    expect(text).toContain(PLUGIN_MARKETPLACE_ADD_COMMAND);
    expect(text).toContain(PLUGIN_INSTALL_COMMAND);
    expect(text).toContain('/buddy-onchain');
    expect(text).toContain('hatch  ->  buddy not yet onchain');
    expect(text).toContain('(needs a Base-compatible wallet)');
    expect(text).toContain('view   ->  buddy is already onchain');
    // Defense: no Unicode arrows on cold (sibling routes still use → /
    // ·; cold register is intentionally ASCII).
    expect(text).not.toContain('→');
  });

  it('clicking the action prompt remounts the walkthrough container (replay)', () => {
    renderHome();
    const button = screen.getByRole('button', { name: /claude/i });
    const before = screen.getByTestId('cold-hero-walkthrough');
    fireEvent.click(button);
    const after = screen.getByTestId('cold-hero-walkthrough');
    // React `key` change unmounts + remounts the container — DOM identity
    // is the cheapest assertion that the animation will restart.
    expect(after).not.toBe(before);
  });

  it('separator rail renders between hero terminal and AUTHOR', () => {
    renderHome();
    const rail = document.querySelector('.route-rail');
    expect(rail).toBeTruthy();
    expect((rail!.textContent ?? '').trim()).toMatch(/^-+$/);
  });

  it('does NOT render the tail terminal prompt cursor on `/`', () => {
    renderHome();
    expect(document.querySelector('.terminal-frame__prompt')).toBeNull();
  });

  it('SEE ALSO row order is /view → /bond → github → contract', () => {
    renderHome();
    const seeHeading = screen.getByRole('heading', { level: 2, name: 'SEE ALSO' });
    const section = seeHeading.closest('section');
    // Row anchor accessible name is `<key> — <descriptor>` per the
    // row-as-anchor markup (see `docs/site/terminal-ui.md` § SEE ALSO
    // row pattern); query with a regex anchored on the key so we get
    // the row regardless of the descriptor copy.
    const grid = within(section!)
      .getByRole('link', { name: /^\/view\s/ })
      .closest('.see-also');
    expect(grid).toBeTruthy();
    const keyCells = grid!.querySelectorAll('.see-also__label');
    const labels = Array.from(keyCells).map((c) => c.textContent?.trim() ?? '');
    expect(labels[0]).toBe('/view');
    expect(labels[1]).toBe('/bond');
    // Repo row left column is the literal label `github` (clickable);
    // the `user/repo` shorthand lives in the right (value) column.
    expect(labels[2]).toBe('github');
  });

  it('SEE ALSO uses ASCII hyphen separators (no `·`) and renders canonical row contents per docs/site/terminal-ui.md', () => {
    renderHome();
    const seeHeading = screen.getByRole('heading', { level: 2, name: 'SEE ALSO' });
    const section = seeHeading.closest('section');
    const text = (section!.textContent ?? '').replace(/\s+/g, ' ');
    // `/bond` row carries plain `stage 2` per docs/site/terminal-ui.md
    // § SEE ALSO row pattern — no warn pill.
    expect(text).toContain('stage 2');
    expect(text).not.toContain('not yet implemented');
    // github row right-column descriptor is the repo shorthand.
    expect(text).toContain('PilsnerChamp/buddies-onchain');
    expect(text).not.toContain('source - manifesto - contracts');
    // `·` is the warm/sibling separator; cold deliberately uses `-`.
    expect(text).not.toContain('·');
  });
});

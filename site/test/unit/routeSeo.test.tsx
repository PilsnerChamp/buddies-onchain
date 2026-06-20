// site/test/unit/routeSeo.test.tsx
//
// RouteSeo manages <link rel=canonical>, og:url, and robots in document.head.
// Regression focus: SPA navigation must not inherit a prior route's canonical
// (e.g. a `/view/<tokenId>` canonical lingering on `/`). RouteSeo defaults the
// canonical to the live pathname, so every route resets it.

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RouteSeo } from '../../src/components/RouteMetadata';

const ORIGIN = 'https://buddies-onchain.xyz';

function canonicalHref(): string | null {
  return (
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.href ?? null
  );
}

function metaContent(selector: string): string | null {
  return (
    document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null
  );
}

function renderSeo(path: string, canonicalPath?: string, robots?: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RouteSeo canonicalPath={canonicalPath} robots={robots} />
    </MemoryRouter>,
  );
}

describe('RouteSeo canonical/robots head management', () => {
  afterEach(() => {
    cleanup();
    document.head
      .querySelectorAll('link[rel="canonical"], meta[name="robots"], meta[property="og:url"]')
      .forEach((node) => node.remove());
  });

  it('defaults canonical + og:url to the live pathname when no canonicalPath given', () => {
    renderSeo('/claim');
    expect(canonicalHref()).toBe(`${ORIGIN}/claim`);
    expect(metaContent('meta[property="og:url"]')).toBe(`${ORIGIN}/claim`);
    expect(metaContent('meta[name="robots"]')).toBe('index, follow');
  });

  it('uses an explicit canonicalPath override (token page)', () => {
    renderSeo('/view/5', '/view/5');
    expect(canonicalHref()).toBe(`${ORIGIN}/view/5`);
    expect(metaContent('meta[property="og:url"]')).toBe(`${ORIGIN}/view/5`);
  });

  it('applies a robots override (manual /view noindex)', () => {
    renderSeo('/view', '/view', 'noindex, follow');
    expect(metaContent('meta[name="robots"]')).toBe('noindex, follow');
    expect(canonicalHref()).toBe(`${ORIGIN}/view`);
  });

  it('resets canonical across navigation — no stale /view/<tokenId> carryover on /', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/view/42']}>
        <RouteSeo canonicalPath="/view/42" />
      </MemoryRouter>,
    );
    expect(canonicalHref()).toBe(`${ORIGIN}/view/42`);
    unmount();

    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteSeo />
      </MemoryRouter>,
    );
    expect(canonicalHref()).toBe(`${ORIGIN}/`);
    expect(metaContent('meta[property="og:url"]')).toBe(`${ORIGIN}/`);
  });
});

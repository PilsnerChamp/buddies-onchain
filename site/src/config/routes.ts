// Single source of truth for route paths. Consumed by `App.tsx`, internal
// `<Link>` targets, redirects, and tests. Use `ROUTES.home` / `ROUTES.view`
// etc. — never literal strings.
//
// `/hatch` takes its mint handoff via URL fragment
// (`/hatch#identityHash=0x…&prngSeed=…`) so it never crosses the HTTP wire.
// Unknown paths are absorbed by the catch-all `*` route in `App.tsx`
// (redirects to `/`).

export const ROUTES = {
  home: '/',
  hatch: '/hatch',
  view: '/view',
  viewToken: '/view/:tokenId',
  bond: '/bond',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
export type NavigableRoute = Exclude<RoutePath, typeof ROUTES.viewToken>;

export function viewTokenPath(tokenId: bigint | number | string): string {
  return `${ROUTES.view}/${tokenId.toString()}`;
}

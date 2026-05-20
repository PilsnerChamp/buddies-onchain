// Single source of truth for route paths. Consumed by `App.tsx`, internal
// `<Link>` targets, redirects, and tests. Use `ROUTES.home` / `ROUTES.view`
// etc. — never literal strings.
//
// `/hatch` takes its UUID via query-param (`/hatch?accountUuid=<uuid>`); no
// path-segment form. Unknown paths are absorbed by the catch-all `*` route
// in `App.tsx` (redirects to `/`).

export const ROUTES = {
  home: '/',
  hatch: '/hatch',
  view: '/view',
  viewUuid: '/view/:uuid',
  bond: '/bond',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
export type NavigableRoute = Exclude<RoutePath, typeof ROUTES.viewUuid>;

export function viewUuidPath(uuid: string): string {
  return `${ROUTES.view}/${uuid}`;
}

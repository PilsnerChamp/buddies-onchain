// site/src/components/RouteStatus.tsx
//
// Shared STATUS row composer: `<lead> · <detail>`, with the exact class
// hooks owned by `man-page-extras.css`.

import type { ReactNode } from 'react';

export type RouteStatusTone =
  | 'normal'
  | 'warn'
  | 'awaiting'
  | 'pre-deploy'
  | 'hatched';

export function RouteStatus({
  lead,
  detail,
  tone,
}: {
  lead: ReactNode;
  detail: ReactNode;
  tone?: RouteStatusTone;
}): JSX.Element {
  return (
    <p className="route-status">
      {lead}
      <span className="route-status__sep"> · </span>
      <span
        className={
          tone === undefined
            ? 'route-status__detail'
            : `route-status__detail route-status__detail--${tone}`
        }
      >
        {detail}
      </span>
    </p>
  );
}

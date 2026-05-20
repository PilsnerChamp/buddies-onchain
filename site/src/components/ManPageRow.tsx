// Two-column row with key/value slots + optional status text. Used inside
// `REQUIREMENTS` sections. `SEE ALSO` uses route-owned grids because its key
// column and link treatment differ. Responsive collapse is container-based.

import type { ReactNode } from 'react';
import './ManPageRow.css';

type ManPageRowProps = {
  /** Key slot (left column). Typically the identifier token. */
  k: ReactNode;
  /** Value/description slot. */
  v: ReactNode;
  /** Optional status token pinned opposite the key. */
  status?: ReactNode;
};

export function ManPageRow({
  k,
  v,
  status,
}: ManPageRowProps): JSX.Element {
  const hasStatus = status !== undefined && status !== null;
  const className = `man-page-row${
    hasStatus ? ' man-page-row--has-status' : ''
  }`;

  return (
    <div className={className}>
      <span className="man-page-row__label">{k}</span>
      {hasStatus && <span className="man-page-row__status">{status}</span>}
      <span className="man-page-row__body">
        <span className="man-page-row__value">{v}</span>
      </span>
    </div>
  );
}

import { Link } from 'react-router-dom';

import type { NavigableRoute } from '../config/routes';
import { AUTHOR_HANDLE, AUTHOR_X_URL } from '../lib/authorLinks';
import { REPO_URL } from '../lib/repoLinks';
import {
  NOT_DEPLOYED_STATUS_CHUNK,
  seeAlsoContractRow,
} from '../lib/seeAlsoContractRow';
import { ManPageSection } from './ManPageSection';

const RAIL = '-'.repeat(200);
const REPO_DISPLAY_SHORT = REPO_URL.replace(/^https?:\/\/github\.com\//, '');

export type SeeAlsoRoute = {
  to: NavigableRoute;
  description: string;
};

type RouteMetadataProps = {
  chainId: number;
  seeAlsoRoutes: readonly SeeAlsoRoute[];
};

function renderContractStatusChunks(chunks: readonly string[]): JSX.Element {
  return (
    <>
      {chunks.map((chunk, idx) => {
        const isWarn = chunk === NOT_DEPLOYED_STATUS_CHUNK;
        return (
          <span key={idx}>
            {idx > 0 && ' - '}
            {isWarn ? (
              <span className="status-text--warning">{chunk}</span>
            ) : (
              chunk
            )}
          </span>
        );
      })}
    </>
  );
}

export function RouteMetadata({
  chainId,
  seeAlsoRoutes,
}: RouteMetadataProps): JSX.Element {
  const contractRow = seeAlsoContractRow(chainId);

  return (
    <>
      <p className="route-rail" aria-hidden="true">
        {RAIL}
      </p>

      <ManPageSection heading="AUTHOR">
        <a
          className="route-author hover-row"
          href={AUTHOR_X_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="hover-row__key">{AUTHOR_HANDLE}</span>
        </a>
      </ManPageSection>

      <ManPageSection heading="SEE ALSO">
        <div className="see-also">
          {seeAlsoRoutes.map(({ to, description }) => (
            <Link
              key={`${to}:${description}`}
              to={to}
              className="see-also__row hover-row"
              aria-label={`${to} — ${description}`}
            >
              <span className="see-also__label">{to}</span>
              <span className="see-also__value">{description}</span>
            </Link>
          ))}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="see-also__row hover-row"
            aria-label={`github — ${REPO_DISPLAY_SHORT}`}
          >
            <span className="see-also__label">github</span>
            <span className="see-also__value">{REPO_DISPLAY_SHORT}</span>
          </a>
          {contractRow.isClickable && contractRow.href !== null ? (
            <a
              href={contractRow.href}
              target="_blank"
              rel="noopener noreferrer"
              className="see-also__row hover-row"
              aria-label={`${contractRow.address} — ${contractRow.statusChunks.join(' - ')}`}
            >
              <span className="see-also__label">{contractRow.address}</span>
              <span className="see-also__value">
                {renderContractStatusChunks(contractRow.statusChunks)}
              </span>
            </a>
          ) : (
            <div className="see-also__row hover-row hover-row--inert">
              <span className="see-also__label">{contractRow.address}</span>
              <span className="see-also__value">
                {renderContractStatusChunks(contractRow.statusChunks)}
              </span>
            </div>
          )}
        </div>
      </ManPageSection>
    </>
  );
}

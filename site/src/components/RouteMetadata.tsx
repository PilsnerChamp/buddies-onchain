import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

import type { NavigableRoute } from '../config/routes';
import { AUTHOR_HANDLE, AUTHOR_X_URL } from '../lib/authorLinks';
import { openseaCollectionRow } from '../lib/openseaCollectionRow';
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
  seo?: RouteSeoProps;
};

export type RouteSeoProps = {
  robots?: string;
  canonicalPath?: string;
};

const SITE_ORIGIN = 'https://buddies-onchain.xyz';

function setMeta(selector: string, attr: 'name' | 'property', key: string): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  if (existing !== null) return existing;
  const meta = document.createElement('meta');
  meta.setAttribute(attr, key);
  document.head.append(meta);
  return meta;
}

function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

export function RouteSeo({
  robots = 'index, follow',
  canonicalPath,
}: RouteSeoProps): null {
  // Default to the live pathname so SPA navigation never inherits a prior
  // route's canonical/og:url (e.g. a stale `/view/<tokenId>` left on `/`).
  // `location.pathname` carries no UUID — the `/hatch` fragment is scrubbed
  // and `/view` keeps the UUID in component state, so canonical stays clean.
  const { pathname } = useLocation();
  const effectiveCanonical = canonicalPath ?? pathname;

  useEffect(() => {
    const robotsMeta = setMeta('meta[name="robots"]', 'name', 'robots');
    robotsMeta.content = robots;

    const canonicalHref = absoluteUrl(effectiveCanonical);
    let canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (canonical === null) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = canonicalHref;

    const ogUrl = setMeta('meta[property="og:url"]', 'property', 'og:url');
    ogUrl.content = canonicalHref;
  }, [effectiveCanonical, robots]);

  return null;
}

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
  seo,
}: RouteMetadataProps): JSX.Element {
  const contractRow = seeAlsoContractRow(chainId);
  const collectionRow = openseaCollectionRow(chainId);

  return (
    <>
      <RouteSeo {...seo} />
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
          {/* OpenSea collection row sits between github and contract so the
              contract stays the last (trust-anchor) row. Omitted entirely when
              there is no live collection — local/sepolia/pre-deploy/unknown. */}
          {collectionRow !== null && (
            <a
              href={collectionRow.href}
              target="_blank"
              rel="noopener noreferrer"
              className="see-also__row hover-row"
              aria-label={`opensea — ${collectionRow.display}`}
            >
              <span className="see-also__label">opensea</span>
              <span className="see-also__value">{collectionRow.display}</span>
            </a>
          )}
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

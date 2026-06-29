// site/src/components/TitlebarTrustIcons.tsx
//
// Trust-link icons for the `/view/<tokenId>` card titlebar (Part A). The card
// happy path is the immutable on-chain SVG flush to the frame edges — it has
// NO SEE ALSO footer, so the two reference links every other route carries in
// its footer ride in the titlebar's right column here instead:
//   Base    → the BuddyNFT contract on Basescan (left — the chain leads)
//   OpenSea → this exact buddy's per-item page  (right — a marketplace viewer)
//
// Contract-first: the chain proof leads the horizontal pair, the canonical
// trust-anchor position for the card (the SEE ALSO footer elsewhere closes on
// the contract row — same anchor, list idiom instead of pair idiom).
//
// Each icon is omitted when its URL is null (local/sepolia/pre-deploy/unknown
// chain). When NEITHER resolves, returns `null` so `TerminalFrame` keeps its
// centering spacer instead of rendering an empty actions column.
//
// `chainId` is a parameter (not read from `ACTIVE_NETWORK` internally) so the
// renderer is testable against any chain. The two URLs come from the shared
// single-selectors (`openseaItemRow`, `seeAlsoContractRow`) — no drift.
//
// Marks are inline monochrome SVG (this Vite setup has no SVGR plugin, so
// importing `.svg` as components is unavailable). `fill="currentColor"` lets
// TerminalFrame.css tint them to the card's slate chrome.

import type { ReactNode } from 'react';

import { openseaItemRow } from '../lib/openseaItemRow';
import { seeAlsoContractRow } from '../lib/seeAlsoContractRow';

function OpenSeaMark(): JSX.Element {
  return (
    <svg
      className="titlebar-action__glyph"
      viewBox="0 0 90 90"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M45 0C20.151 0 0 20.151 0 45c0 24.849 20.151 45 45 45 24.849 0 45-20.151 45-45C90 20.151 69.857 0 45 0ZM22.203 46.512l.192-.303 11.61-18.165c.169-.264.565-.235.696.05 1.94 4.349 3.612 9.766 2.827 13.137-.331 1.385-1.244 3.257-2.27 4.988-.132.247-.276.488-.43.72a.359.359 0 0 1-.296.165H22.5a.358.358 0 0 1-.297-.557ZM74.38 52.7a.376.376 0 0 1-.216.34c-.73.313-3.231 1.45-4.275 2.903-2.66 3.703-4.69 8.99-9.23 8.99H34.122c-6.71 0-12.146-5.456-12.146-12.19v-.27a.36.36 0 0 1 .36-.36h12.97a.59.59 0 0 1 .59.59v.93c0 .51.41.92.92.92h6.42v-5.014h-6.342a.36.36 0 0 1-.29-.572c.08-.108.17-.222.27-.346.71-.9 1.72-2.295 2.72-4.045.685-1.18 1.35-2.44 1.885-3.7.108-.232.195-.474.291-.706.142-.4.291-.774.388-1.148.097-.31.184-.638.27-.948.247-1.067.36-2.2.36-3.376 0-.464-.02-.948-.06-1.412-.022-.504-.088-1.008-.154-1.512-.044-.464-.13-.929-.215-1.413-.117-.706-.273-1.4-.452-2.094l-.066-.27c-.13-.484-.249-.948-.388-1.412-.39-1.36-.834-2.673-1.302-3.91-.166-.471-.354-.926-.55-1.39-.286-.706-.575-1.341-.834-1.945-.135-.27-.249-.514-.367-.766-.13-.286-.26-.572-.394-.838-.097-.21-.214-.408-.29-.594l-.84-1.55c-.117-.214.083-.464.32-.398l4.91 1.33h.014c.01 0 .014.004.02.004l.645.179.71.198.26.073v-2.916c0-1.41 1.125-2.553 2.518-2.553.696 0 1.328.286 1.776.748.448.464.732 1.1.732 1.805v4.327l.522.146a.59.59 0 0 1 .118.06c.127.092.31.234.546.408.184.139.378.31.615.498.472.378 1.035.866 1.65 1.426.165.142.32.286.47.43.796.74 1.69 1.61 2.547 2.57.236.27.467.542.702.83.235.29.484.577.701.864.286.38.59.775.857 1.186.123.198.265.4.382.597.34.51.638 1.033.922 1.555.12.244.242.51.346.772.31.7.556 1.41.71 2.118.046.154.08.317.097.475v.036c.057.224.073.464.093.708.073.78.04 1.56-.13 2.275-.07.305-.163.597-.273.89-.11.29-.221.594-.363.87-.273.557-.6 1.087-.954 1.582-.116.165-.242.336-.366.494-.135.17-.276.333-.398.486-.17.205-.349.417-.534.605-.166.198-.336.393-.524.568-.276.273-.54.531-.818.774-.16.156-.334.31-.498.448-.17.146-.343.28-.498.407-.27.213-.49.381-.677.519l-.428.315a.357.357 0 0 1-.214.07h-3.911v5.014h4.918c1.099 0 2.144-.387 2.987-1.105.29-.254 1.561-1.348 3.057-3.001a.346.346 0 0 1 .183-.107l13.586-3.928a.59.59 0 0 1 .754.567v2.81Z"
      />
    </svg>
  );
}

function BaseMark(): JSX.Element {
  return (
    <svg
      className="titlebar-action__glyph"
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M50 100C77.614 100 100 77.614 100 50S77.614 0 50 0C23.794 0 2.355 20.156.064 45.762h66.183v8.476H.064C2.355 79.844 23.794 100 50 100Z"
      />
    </svg>
  );
}

/**
 * Builds the card-titlebar trust icons for a token. Returns `null` when no
 * link resolves on `chainId` so the caller passes nothing and the spacer
 * survives. Pure (no hooks) — safe to call inline in render.
 */
export function titlebarTrustIcons(
  tokenId: bigint,
  chainId: number,
): ReactNode | null {
  const openseaHref = openseaItemRow(chainId, tokenId);
  const contractHref = seeAlsoContractRow(chainId).href;

  if (openseaHref === null && contractHref === null) return null;

  return (
    <>
      {contractHref !== null && (
        <a
          className="titlebar-action"
          href={contractHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View contract on Basescan"
        >
          <BaseMark />
        </a>
      )}
      {openseaHref !== null && (
        <a
          className="titlebar-action"
          href={openseaHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View this buddy on OpenSea"
        >
          <OpenSeaMark />
        </a>
      )}
    </>
  );
}

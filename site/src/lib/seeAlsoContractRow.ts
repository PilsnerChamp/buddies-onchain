// Single selector powering the SEE ALSO contract row on `/`, the footer
// contract strip on `/hatch` and `/view/<uuid>`, and the display portion of
// `/view`'s signed statement. Cross-surface drift is structurally impossible
// when every surface reads from this one function.
//
// Returns `{ address, statusChunks, href, isClickable }`. Pre-deploy display
// literal uses the Unicode horizontal ellipsis U+2026 (`…`), NOT three ASCII
// dots — do not silently normalize during refactors.
//
// `href` is `null` whenever the row should render as inert plain text —
// pre-deploy or any chain lacking a configured explorer base (e.g. Anvil
// 31337). `0x0000…0000` MUST stay inert pre-deploy. Callers render
// `<a href={href}>` when `isClickable`, `<span>` otherwise.

import { getNetwork } from '../config/chains';

// Unicode U+2026 horizontal ellipsis. The UI contract requires this glyph,
// not three ASCII dots.
const HORIZONTAL_ELLIPSIS = '…';
const PLACEHOLDER_ADDRESS = `0x0000${HORIZONTAL_ELLIPSIS}0000`;
export const NOT_DEPLOYED_STATUS_CHUNK = 'not yet deployed';

type SeeAlsoContractRow = {
  address: string;
  statusChunks: string[];
  href: string | null;
  isClickable: boolean;
};

// Shortens a real deployed address for display: first 6 chars + ellipsis +
// last 4 chars. Only invoked when `status === 'deployed'` and the contract
// address is non-null.
function shortAddress(address: `0x${string}`): string {
  return `${address.slice(0, 6)}${HORIZONTAL_ELLIPSIS}${address.slice(-4)}`;
}

// Builds an explorer URL for the given chain + raw address. Returns `null`
// when the chain has no configured explorer base (Anvil, unknown chains)
// so the caller can render inert text. Uses the raw (unshortened) address
// because the display-shortening (`0x1234…5678`) is lossy — the href needs
// the full 40-nibble value to deep-link correctly.
function buildExplorerHref(
  explorerBase: string | null,
  rawAddress: `0x${string}`,
): string | null {
  return explorerBase === null ? null : `${explorerBase}${rawAddress}`;
}

export function seeAlsoContractRow(chainId: number): SeeAlsoContractRow {
  const net = getNetwork(chainId);

  // Unknown chain: surface the pre-deploy inert shape with `'unknown'` as
  // the display name. From the user's perspective the absence of a config
  // entry is the same state as not-yet-deployed — no live contract on the
  // selected network.
  if (net === null) {
    return {
      address: PLACEHOLDER_ADDRESS,
      statusChunks: ['contract', NOT_DEPLOYED_STATUS_CHUNK, 'unknown'],
      href: null,
      isClickable: false,
    };
  }

  const network = net.displayName;
  const address = net.buddyNft;
  const status = net.status;

  // Post-deploy: real address + compact chunks. No "not yet deployed"
  // phrasing. The `getNetwork()` contract structurally guarantees
  // `address !== null` whenever `status === 'deployed'`; the explicit
  // `address !== null` check below is a TS narrowing aid, not a runtime
  // safety branch.
  if (status === 'deployed' && address !== null) {
    const href = buildExplorerHref(net.explorerAddressBase, address);
    return {
      address: shortAddress(address),
      statusChunks: ['contract', network],
      href,
      isClickable: href !== null,
    };
  }

  // Pre-deploy (`not-yet-deployed`): placeholder address + three-chunk
  // status row. `href` is null so success criterion #6 (`0x0000…0000`
  // inert pre-deploy) is structurally guaranteed, not just a render-side
  // convention.
  return {
    address: PLACEHOLDER_ADDRESS,
    statusChunks: ['contract', NOT_DEPLOYED_STATUS_CHUNK, network],
    href: null,
    isClickable: false,
  };
}

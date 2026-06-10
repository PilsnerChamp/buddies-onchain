// Decodes a `tokenURI(uint256)` return value into the inline SVG string
// rendered as the buddy centerpiece on `/view/<tokenId>` and post-confirmation
// `/hatch`. On-chain shape (per `BuddyRenderer.sol`):
//   `data:application/json;base64,<base64( JSON.stringify({ name, description,
//     image: "data:image/svg+xml;base64,<base64(SVG)>", attributes }) )>`
//
// Pipeline:
//   1. Strip the `data:application/json;base64,` prefix.
//   2. Base64-decode the metadata payload to a UTF-8 JSON string.
//   3. Parse the JSON; pull `.image`.
//   4. Strip the `data:image/svg+xml;base64,` prefix from `.image`.
//   5. Base64-decode the SVG payload to a UTF-8 SVG string.
//
// Throws on missing prefix, base64 failure, JSON.parse failure, or missing
// `.image` field. Caller wraps in a route-level `<ErrorBoundary>`.

const JSON_PREFIX = 'data:application/json;base64,';
const SVG_PREFIX = 'data:image/svg+xml;base64,';

// Decodes a base64 string to a UTF-8 string. `atob` returns binary as a
// JS string with one Unicode code unit per byte; `TextDecoder` interprets
// the bytes as UTF-8 so multi-byte sequences (the SVG carries them in
// CSS `content:` rules and font name strings) round-trip correctly.
function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export type DecodedTokenAttribute = {
  trait_type?: string;
  value?: unknown;
};

export type DecodedTokenMetadata = {
  name?: string;
  description?: string;
  image: string;
  attributes?: ReadonlyArray<DecodedTokenAttribute>;
};

export function decodeTokenUri(tokenUri: string): DecodedTokenMetadata {
  if (!tokenUri.startsWith(JSON_PREFIX)) {
    throw new Error('decodeTokenUri: missing data:application/json prefix');
  }
  const payload = tokenUri.slice(JSON_PREFIX.length);
  const json = base64ToUtf8(payload);
  const parsed = JSON.parse(json) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('image' in parsed) ||
    typeof (parsed as { image: unknown }).image !== 'string'
  ) {
    throw new Error('decodeTokenUri: parsed JSON missing string `image` field');
  }
  return parsed as DecodedTokenMetadata;
}

export function decodeTokenMetadataToSvg(meta: DecodedTokenMetadata): string {
  if (!meta.image.startsWith(SVG_PREFIX)) {
    throw new Error('decodeTokenUriToSvg: image missing data:image/svg+xml prefix');
  }
  const svgB64 = meta.image.slice(SVG_PREFIX.length);
  return base64ToUtf8(svgB64);
}

// Returns the inline SVG markup string. Renderer (`Hatch.tsx`) inserts
// via `dangerouslySetInnerHTML` because the SVG is sourced from the
// contract's bytecode and is the canonical visual; sanitizing or
// re-parsing would risk drift from the on-chain truth.
export function decodeTokenUriToSvg(tokenUri: string): string {
  const meta = decodeTokenUri(tokenUri);
  return decodeTokenMetadataToSvg(meta);
}

// site/test/unit/decodeTokenUri.test.ts
//
// Covers the data-URI → SVG decode path for `tokenURI()` return values.
// The on-chain return shape is:
//
//   data:application/json;base64,<base64( JSON({ name, description, image, attributes }) )>
//
// where `image` itself is `data:image/svg+xml;base64,<base64(SVG)>`.
//
// These tests use synthetic fixtures (not real contract output) so they
// don't depend on the contract being deployed. Round-tripping a known
// SVG through the encoder is enough to lock the public decoder behavior.

import { describe, it, expect } from 'vitest';
import {
  decodeTokenUri,
  decodeTokenUriToSvg,
} from '../../src/lib/decodeTokenUri';

// Helper: encode a UTF-8 string to base64 the way browsers do (matches
// the production `atob` round-trip in `base64ToUtf8`).
function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildTokenUri(svg: string, extras: Record<string, unknown> = {}): string {
  const imageDataUri = `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
  const meta = {
    name: 'buddy #1',
    description: 'One account. One buddy.',
    image: imageDataUri,
    attributes: [
      { trait_type: 'species', value: 'cat' },
      { trait_type: 'Provider', value: 'claude' },
    ],
    ...extras,
  };
  return `data:application/json;base64,${utf8ToBase64(JSON.stringify(meta))}`;
}

describe('decodeTokenUriToSvg', () => {
  it('decodes full metadata attributes, including Provider', () => {
    const tokenUri = buildTokenUri('<svg />');
    const metadata = decodeTokenUri(tokenUri);

    expect(metadata.attributes).toContainEqual({
      trait_type: 'Provider',
      value: 'claude',
    });
  });

  it('round-trips an SVG through the full decode pipeline', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>';
    const tokenUri = buildTokenUri(svg);
    expect(decodeTokenUriToSvg(tokenUri)).toBe(svg);
  });

  it('preserves UTF-8 characters in the SVG (e.g. ▊ block + middle-dot)', () => {
    // The on-chain SVG embeds CSS `content:` rules with multi-byte glyphs.
    // The decoder must round-trip them, not mojibake.
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>BUDDIES·ONCHAIN ▊</text></svg>';
    const tokenUri = buildTokenUri(svg);
    expect(decodeTokenUriToSvg(tokenUri)).toBe(svg);
  });

  it('throws on missing JSON prefix', () => {
    expect(() => decodeTokenUriToSvg('not-a-data-uri')).toThrow(
      /missing data:application\/json prefix/,
    );
  });

  it('throws when the parsed JSON has no string `image`', () => {
    const broken = `data:application/json;base64,${utf8ToBase64(
      JSON.stringify({ name: 'x' }),
    )}`;
    expect(() => decodeTokenUriToSvg(broken)).toThrow(/missing string `image`/);
  });

  it('throws when the image data URI is missing the SVG prefix', () => {
    const tokenUri = `data:application/json;base64,${utf8ToBase64(
      JSON.stringify({ image: 'data:image/png;base64,xxx' }),
    )}`;
    expect(() => decodeTokenUriToSvg(tokenUri)).toThrow(
      /missing data:image\/svg\+xml prefix/,
    );
  });

  it('throws on malformed base64 in the SVG payload', () => {
    // A bogus base64 char `*` triggers the atob throw inside the decoder.
    const tokenUri = `data:application/json;base64,${utf8ToBase64(
      JSON.stringify({ image: 'data:image/svg+xml;base64,***' }),
    )}`;
    expect(() => decodeTokenUriToSvg(tokenUri)).toThrow();
  });
});

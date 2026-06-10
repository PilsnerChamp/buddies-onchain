// shared/providerBytes16.ts
//
// BuddyNFT provider-label codec. This mirrors the onchain `_validateProvider`
// rule for the `bytes16 provider` hatch argument and `buddyProvider` getter:
// one to sixteen lowercase ASCII bytes from `[a-z0-9-]`, followed by
// null-byte padding only.

export type ProviderBytes16 = `0x${string}`;

export const CLAUDE_PROVIDER = 'claude';

const PROVIDER_MAX_BYTES = 16;
const PROVIDER_HEX_CHARS = PROVIDER_MAX_BYTES * 2;
const HEX_PREFIX = '0x';

function isProviderCode(code: number): boolean {
  return (
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 45
  );
}

function isHexCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 97 && code <= 102) ||
    (code >= 65 && code <= 70)
  );
}

function assertProvider(provider: string): void {
  if (provider.length === 0 || provider.length > PROVIDER_MAX_BYTES) {
    throw new Error('invalid provider');
  }

  for (let i = 0; i < provider.length; i++) {
    if (!isProviderCode(provider.charCodeAt(i))) {
      throw new Error('invalid provider');
    }
  }
}

export function encodeProviderBytes16(provider: string): ProviderBytes16 {
  assertProvider(provider);

  let hex = HEX_PREFIX;
  for (let i = 0; i < provider.length; i++) {
    hex += provider.charCodeAt(i).toString(16).padStart(2, '0');
  }

  return (
    hex + '0'.repeat(PROVIDER_HEX_CHARS - (hex.length - HEX_PREFIX.length))
  ) as ProviderBytes16;
}

export function decodeProviderBytes16(value: ProviderBytes16): string {
  if (
    value.length !== HEX_PREFIX.length + PROVIDER_HEX_CHARS ||
    !value.startsWith(HEX_PREFIX)
  ) {
    throw new Error('invalid provider bytes16');
  }

  let provider = '';
  let sawNull = false;

  for (let i = HEX_PREFIX.length; i < value.length; i += 2) {
    if (
      !isHexCode(value.charCodeAt(i)) ||
      !isHexCode(value.charCodeAt(i + 1))
    ) {
      throw new Error('invalid provider bytes16');
    }

    const byte = Number.parseInt(value.slice(i, i + 2), 16);
    if (byte === 0) {
      sawNull = true;
      continue;
    }

    if (sawNull || !isProviderCode(byte)) {
      throw new Error('invalid provider bytes16');
    }

    provider += String.fromCharCode(byte);
  }

  if (provider.length === 0) {
    throw new Error('invalid provider bytes16');
  }

  return provider;
}

export const CLAUDE_PROVIDER_BYTES16 =
  encodeProviderBytes16(CLAUDE_PROVIDER);

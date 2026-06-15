const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type DeploymentConfigArgs = {
  activeChainId: number;
  localChainId: number;
  hasCommittedManifest: boolean;
  address: string | undefined;
  block: string | undefined;
};

export function parseBuddyNftAddress(
  value: string | undefined,
): `0x${string}` | null {
  const address = value?.trim();
  if (!address) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
  if (address.toLowerCase() === ZERO_ADDRESS) return null;
  return address as `0x${string}`;
}

export function parseBuddyNftBlock(value: string | undefined): number | null {
  const blockText = value?.trim();
  if (!blockText || !/^\d+$/.test(blockText)) return null;
  const block = Number(blockText);
  if (!Number.isSafeInteger(block)) return null;
  return block;
}

export function assertDeploymentConfig({
  activeChainId,
  localChainId,
  hasCommittedManifest,
  address,
  block,
}: DeploymentConfigArgs): void {
  if (activeChainId === localChainId || hasCommittedManifest) return;

  if (parseBuddyNftAddress(address) === null) {
    throw new Error(
      `Missing or invalid VITE_BUDDY_NFT_ADDRESS for chain ${activeChainId}.`,
    );
  }

  if (parseBuddyNftBlock(block) === null) {
    throw new Error(
      `Missing or invalid VITE_BUDDY_NFT_BLOCK for chain ${activeChainId}.`,
    );
  }
}

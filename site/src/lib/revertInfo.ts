import { BaseError, ContractFunctionRevertedError } from 'viem';

type ErrorInfoNode = {
  readonly name?: string;
  readonly cause?: unknown;
  readonly data?: { readonly errorName?: string };
  readonly details?: string;
  readonly shortMessage?: string;
  readonly message?: string;
};

export type RevertInfo = {
  readonly errorNames: readonly string[];
  readonly contractRevert: ContractFunctionRevertedError | null;
};

const ERROR_NAME_DEPTH_LIMIT = 8;

export function getRevertInfo(err: unknown): RevertInfo {
  const errorNames: string[] = [];
  let contractRevert: ContractFunctionRevertedError | null = null;
  const canContainContractRevert = err instanceof BaseError;

  let cursor: unknown = err;
  for (let depth = 0; cursor && typeof cursor === 'object'; depth++) {
    if (
      canContainContractRevert &&
      contractRevert === null &&
      cursor instanceof ContractFunctionRevertedError
    ) {
      contractRevert = cursor;
    }

    const node = cursor as ErrorInfoNode;
    if (depth < ERROR_NAME_DEPTH_LIMIT) {
      if (node.name) errorNames.push(node.name.toLowerCase());
      if (node.data?.errorName) errorNames.push(node.data.errorName.toLowerCase());
      if (node.shortMessage) errorNames.push(node.shortMessage.toLowerCase());
      if (node.details) errorNames.push(node.details.toLowerCase());
      if (node.message) errorNames.push(node.message.toLowerCase());
    }

    if (
      depth + 1 >= ERROR_NAME_DEPTH_LIMIT &&
      (!canContainContractRevert || contractRevert !== null)
    ) {
      break;
    }
    cursor = node.cause;
  }

  return { errorNames, contractRevert };
}

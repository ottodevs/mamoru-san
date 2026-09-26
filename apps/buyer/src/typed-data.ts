import { authorizationTypes } from "@x402/evm";
import type { PaymentRequirements } from "@x402/core/types";

export interface Eip3009TypedData {
  readonly domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  readonly types: { TransferWithAuthorization: typeof authorizationTypes.TransferWithAuthorization };
  readonly primaryType: "TransferWithAuthorization";
  readonly message: {
    from: `0x${string}`;
    to: `0x${string}`;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: `0x${string}`;
  };
}

function randomNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

/**
 * Builds the EIP-3009 TransferWithAuthorization typed data the exact-EVM
 * scheme is about to sign, so we can scan it with Intercepta BEFORE signing.
 * The domain name/version come from @x402/evm's own default asset table
 * (the same source the SDK itself uses to build a valid signature), not a
 * guess — see policy.ts.
 */
export function buildTransferWithAuthorizationTypedData(params: {
  readonly requirements: PaymentRequirements;
  readonly from: `0x${string}`;
  readonly domainName: string;
  readonly domainVersion: string;
}): Eip3009TypedData {
  const chainId = Number(params.requirements.network.split(":")[1]);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const timeoutSeconds = params.requirements.maxTimeoutSeconds || 300;

  return {
    domain: {
      name: params.domainName,
      version: params.domainVersion,
      chainId,
      verifyingContract: params.requirements.asset as `0x${string}`,
    },
    types: { TransferWithAuthorization: authorizationTypes.TransferWithAuthorization },
    primaryType: "TransferWithAuthorization",
    message: {
      from: params.from,
      to: params.requirements.payTo as `0x${string}`,
      value: params.requirements.amount,
      validAfter: "0",
      validBefore: String(nowSeconds + timeoutSeconds),
      nonce: randomNonce(),
    },
  };
}

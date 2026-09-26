import type { PaymentCreationContext } from "@x402/core/client";
import { findDefaultAsset } from "@x402/evm";
import { quickScan, scanMessage, tokenRisks, toxicScore } from "@mamoru-san/intercepta";
import { screen, type ScreenResult } from "@mamoru-san/screen";
import { buildTransferWithAuthorizationTypedData } from "./typed-data.ts";

/** Base mainnet USDC — Intercepta's token-intelligence endpoint documents
 * mainnet chain ids only, so testnet USDC is screened as its mainnet
 * counterpart (handoff: "el cribado usa direcciones y chainId de mainnet
 * aunque el pago sea Sepolia"). */
const MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const MAINNET_CHAIN_ID = 8453;

/** Maps the payment requirement's asset to the address Intercepta should
 * screen. Only the documented Base Sepolia <-> Base mainnet USDC mapping is
 * applied; any other asset is screened as-is. */
export function assetToScreen(requirementAsset: string): string {
  if (requirementAsset.toLowerCase() === BASE_SEPOLIA_USDC.toLowerCase()) {
    return MAINNET_USDC;
  }
  return requirementAsset;
}

export interface ScreenBeforePaymentOptions {
  readonly from: `0x${string}`;
  readonly allowlist: readonly string[];
}

/**
 * Runs the buyer's pre-signature screen (onBeforePaymentCreation body):
 * payTo (quickScan + toxicScore), asset (tokenRisks, mainnet mapping above),
 * and the EIP-3009 message it is about to sign (scanMessage) — then applies
 * the spend policy (cap + payTo allowlist).
 */
export async function screenBeforePayment(
  ctx: PaymentCreationContext,
  opts: ScreenBeforePaymentOptions,
): Promise<ScreenResult> {
  const { selectedRequirements } = ctx;
  const assetAddress = assetToScreen(selectedRequirements.asset);

  const defaultAsset = findDefaultAsset(selectedRequirements.asset, selectedRequirements.network);
  const domainName = defaultAsset?.name ?? "USDC";
  const domainVersion = defaultAsset?.version ?? "2";

  const typedData = buildTransferWithAuthorizationTypedData({
    requirements: selectedRequirements,
    from: opts.from,
    domainName,
    domainVersion,
  });

  const [payToQuickScan, payToToxicScore, assetRisk, messageScan] = await Promise.all([
    quickScan(selectedRequirements.payTo),
    toxicScore(selectedRequirements.payTo),
    tokenRisks(assetAddress, MAINNET_CHAIN_ID),
    scanMessage(typedData, MAINNET_CHAIN_ID, { from: opts.from }),
  ]);

  return screen({
    address: { quickScan: payToQuickScan, toxicScore: payToToxicScore },
    token: [assetRisk],
    message: messageScan,
    spend: {
      amountAtomic: BigInt(selectedRequirements.amount),
      payTo: selectedRequirements.payTo,
      allowlist: opts.allowlist,
    },
  });
}

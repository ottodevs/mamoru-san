import type { Verdict } from "./types.ts";

/** Traits that deny outright (quick-scan / toxic-score `traits[].name`). */
export const DENY_TRAITS: ReadonlySet<string> = new Set([
  "sanction_address",
  "known_scammer",
  "blacklist",
  "mixer_transfers",
  "rug_pull",
]);

/** Detector code that, combined with `riskGroup: High`, forces REFUSE. */
export const WALLET_DRAINER_DETECTOR = "WALLET_DRAINER";

/** messageType values the live API documents as classified (Permit / Permit2 family).
 * EIP-3009 TransferWithAuthorization (used by x402 exact-EVM) is not in this set —
 * that is expected, not an error. See screen-message.ts. */
export const CLASSIFIED_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "Permit",
  "PermitSingle",
  "PermitBatch",
  "PermitForAll",
  "PermitTransferFrom",
  "PermitBatchTransferFrom",
]);

/** Spend policy, in atomic USDC units (6 decimals). Whoever signs sets the cap. */
export const SPEND_CAP_BASE_ATOMIC = 5_000n; // 0.005 USDC
export const SPEND_CAP_REDUCED_ATOMIC = 1_000n; // 0.001 USDC, applied once risk parts are not clean

export const VERDICT_SEVERITY: Record<Verdict, number> = {
  PAY: 0,
  CAP: 1,
  HOLD: 2,
  REFUSE: 3,
};

/** The more severe of two verdicts. REFUSE > HOLD > CAP > PAY. */
export function worse(a: Verdict, b: Verdict): Verdict {
  return VERDICT_SEVERITY[a] >= VERDICT_SEVERITY[b] ? a : b;
}

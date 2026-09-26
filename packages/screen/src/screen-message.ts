import { CLASSIFIED_MESSAGE_TYPES, WALLET_DRAINER_DETECTOR } from "./rules.ts";
import { isScanFailure, type MessageScan, type PartResult, type Scan } from "./types.ts";

/**
 * Screens the EIP-712 message the payer is about to sign.
 *
 * Policy (handoff "Política de la llamada", with the model-doc nuance applied):
 * - A failed call (timeout, bad body, 403, or no_api_key) -> HOLD. A silence is
 *   not a payment.
 * - riskGroup High + WALLET_DRAINER detector -> REFUSE.
 * - riskGroup High (without WALLET_DRAINER) or Medium -> CAP.
 * - riskGroup Low with a classified messageType (Permit/Permit2 family) and no
 *   detectors -> clean.
 * - riskGroup Low with a classified messageType but detectors present -> CAP.
 * - riskGroup Low with NO messageType (unclassified) is the expected outcome for
 *   x402's EIP-3009 TransferWithAuthorization, which the scan-message enum does
 *   not cover. Scan Message alone must not force PAY, but an unclassified
 *   result is also not itself a block: it is recorded as a reason and payTo +
 *   asset screening decide the verdict instead.
 */
export function screenMessage(scan: Scan<MessageScan>): PartResult {
  if (isScanFailure(scan)) {
    return {
      verdict: "HOLD",
      reasons: [{ code: scan.kind, detail: scan.detail ?? "scan-message call failed", source: "message" }],
    };
  }

  const { riskGroup, detectors, messageType } = scan;
  const classified = messageType !== undefined && CLASSIFIED_MESSAGE_TYPES.has(messageType);

  if (riskGroup === "High" && detectors.includes(WALLET_DRAINER_DETECTOR)) {
    return {
      verdict: "REFUSE",
      reasons: [{ code: "message_wallet_drainer", detail: "riskGroup High with WALLET_DRAINER detector", source: "message" }],
    };
  }

  if (riskGroup === "High") {
    return {
      verdict: "CAP",
      reasons: [{ code: "message_high_risk", detail: "riskGroup High", source: "message" }],
    };
  }

  if (riskGroup === "Medium") {
    return {
      verdict: "CAP",
      reasons: [{ code: "message_medium_risk", detail: "riskGroup Medium", source: "message" }],
    };
  }

  // riskGroup === "Low"
  if (!classified) {
    return {
      verdict: "PAY",
      reasons: [
        {
          code: "message_unclassified",
          detail:
            "riskGroup Low default; messageType is not in the documented Permit/Permit2 enum " +
            "(expected for EIP-3009 TransferWithAuthorization) — payTo and asset screening decide instead",
          source: "message",
        },
      ],
    };
  }

  if (detectors.length > 0) {
    return {
      verdict: "CAP",
      reasons: [{ code: "message_detectors_present", detail: `detectors: ${detectors.join(", ")}`, source: "message" }],
    };
  }

  return { verdict: "PAY", reasons: [] };
}

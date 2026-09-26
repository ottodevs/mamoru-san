/**
 * Pure types for the screen package.
 *
 * Every input here is a NORMALIZED Intercepta result (or a typed failure).
 * This package never calls the network — it only turns normalized results
 * into a verdict. Normalization happens in @mamoru-san/intercepta.
 */

/** The four outcomes a call can produce. Severity order: REFUSE > HOLD > CAP > PAY. */
export type Verdict = "PAY" | "REFUSE" | "CAP" | "HOLD";

/** Why an Intercepta call could not be answered. */
export type ScanFailureKind = "timeout" | "forbidden" | "bad_body" | "no_api_key";

export interface ScanFailure {
  readonly kind: ScanFailureKind;
  readonly detail?: string;
}

/** A scan result is either the normalized success shape, or a typed failure. */
export type Scan<T> = T | ScanFailure;

export function isScanFailure(value: unknown): value is ScanFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "string" &&
    ["timeout", "forbidden", "bad_body", "no_api_key"].includes((value as { kind: string }).kind)
  );
}

/** Normalized quick-scan / toxic-score response (same schema for both). */
export interface AddressTrait {
  readonly name: string;
  readonly risk?: number;
}

export interface AddressScan {
  readonly toxicScore: number;
  readonly traits: readonly AddressTrait[];
}

/** Normalized token-risks response. The live API calls this field `detectors`;
 * we normalize it to `reasons` (code + detail) for a uniform reason shape. */
export interface TokenRiskReason {
  readonly code: string;
  readonly detail: string;
}

export interface TokenRisk {
  readonly action: "block" | "warn" | "info";
  readonly reasons: readonly TokenRiskReason[];
}

/** Normalized scan-message (signature analysis) response.
 * `messageType` is absent when the API could not classify the EIP-712 payload
 * (this is the expected outcome for EIP-3009 TransferWithAuthorization, which
 * is not in the documented Permit/Permit2 enum). */
export interface MessageScan {
  readonly riskGroup: "Low" | "Medium" | "High";
  readonly detectors: readonly string[];
  readonly messageType?: string;
}

/** One reason behind a verdict, attributable to a source. */
export interface Reason {
  readonly code: string;
  readonly detail: string;
  readonly source: "address" | "token" | "message" | "spend";
}

export interface PartResult {
  readonly verdict: Verdict;
  readonly reasons: readonly Reason[];
}

export interface ScreenResult {
  readonly verdict: Verdict;
  readonly reasons: readonly Reason[];
}

/** Address screening needs both the quick-scan and the toxic-score call. */
export interface AddressScreenInput {
  readonly quickScan: Scan<AddressScan>;
  readonly toxicScore: Scan<AddressScan>;
}

/** Spend policy is only evaluated by whoever signs (the buyer). */
export interface SpendScreenInput {
  readonly amountAtomic: bigint;
  readonly payTo: string;
  readonly allowlist: readonly string[];
}

export interface ScreenInput {
  readonly address?: AddressScreenInput;
  readonly token?: readonly Scan<TokenRisk>[];
  readonly message?: Scan<MessageScan>;
  readonly spend?: SpendScreenInput;
}

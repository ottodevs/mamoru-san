import { DENY_TRAITS, worse } from "./rules.ts";
import { isScanFailure, type AddressScreenInput, type PartResult, type Reason, type Verdict } from "./types.ts";

/**
 * Screens a payer/payee address using quick-scan + toxic-score together.
 * Deny traits (sanction_address, known_scammer, blacklist, mixer_transfers,
 * rug_pull) on either call -> REFUSE. A failed call (including no_api_key) -> HOLD.
 */
export function screenAddress(input: AddressScreenInput): PartResult {
  const reasons: Reason[] = [];
  let verdict: Verdict = "PAY";

  const calls: readonly [string, AddressScreenInput["quickScan"]][] = [
    ["quick-scan", input.quickScan],
    ["toxic-score", input.toxicScore],
  ];

  for (const [label, scan] of calls) {
    if (isScanFailure(scan)) {
      verdict = worse(verdict, "HOLD");
      reasons.push({ code: scan.kind, detail: scan.detail ?? `${label} call failed`, source: "address" });
      continue;
    }
    for (const trait of scan.traits) {
      if (DENY_TRAITS.has(trait.name)) {
        verdict = worse(verdict, "REFUSE");
        reasons.push({ code: "deny_trait", detail: `${trait.name} (${label})`, source: "address" });
      }
    }
  }

  return { verdict, reasons };
}

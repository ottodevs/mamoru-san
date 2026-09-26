import { SPEND_CAP_BASE_ATOMIC, SPEND_CAP_REDUCED_ATOMIC, worse } from "./rules.ts";
import type { PartResult, Reason, SpendScreenInput, Verdict } from "./types.ts";

/**
 * Whoever signs sets the cap: 0.005 USDC per call by default, lowered to
 * 0.001 USDC once the risk parts (address/token/message) are not clean.
 * Above the applicable cap, or a payTo outside the allowlist -> HOLD for a
 * person. No Intercepta verdict ever sets this number.
 */
export function screenSpend(input: SpendScreenInput & { readonly riskVerdict: Verdict }): PartResult {
  const reasons: Reason[] = [];
  let verdict: Verdict = "PAY";

  const cap = input.riskVerdict === "PAY" ? SPEND_CAP_BASE_ATOMIC : SPEND_CAP_REDUCED_ATOMIC;
  const allowed = input.allowlist.some((entry) => entry.toLowerCase() === input.payTo.toLowerCase());

  if (!allowed) {
    verdict = worse(verdict, "HOLD");
    reasons.push({ code: "spend_payto_not_allowlisted", detail: `${input.payTo} is not in the payTo allowlist`, source: "spend" });
  }

  if (input.amountAtomic > cap) {
    verdict = worse(verdict, "HOLD");
    reasons.push({
      code: "spend_over_cap",
      detail: `amount ${input.amountAtomic} exceeds ${input.riskVerdict === "PAY" ? "base" : "reduced"} cap ${cap}`,
      source: "spend",
    });
  }

  return { verdict, reasons };
}

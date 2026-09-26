import { worse } from "./rules.ts";
import { isScanFailure, type PartResult, type Reason, type Scan, type TokenRisk, type Verdict } from "./types.ts";

/**
 * Screens one or more token-risks results (seller checks token0 + token1,
 * buyer checks the payment asset). `block` -> REFUSE, `warn` -> CAP,
 * `info` -> clean, a failed call or an unrecognized action -> HOLD.
 */
export function screenToken(risks: readonly Scan<TokenRisk>[]): PartResult {
  const reasons: Reason[] = [];
  let verdict: Verdict = "PAY";

  risks.forEach((risk, index) => {
    if (isScanFailure(risk)) {
      verdict = worse(verdict, "HOLD");
      reasons.push({
        code: risk.kind,
        detail: risk.detail ?? `token-risks call failed (token index ${index})`,
        source: "token",
      });
      return;
    }

    if (risk.action === "block") {
      verdict = worse(verdict, "REFUSE");
      reasons.push({
        code: "token_block",
        detail: risk.reasons.map((r) => r.code).join(", ") || "action=block",
        source: "token",
      });
    } else if (risk.action === "warn") {
      verdict = worse(verdict, "CAP");
      reasons.push({
        code: "token_warn",
        detail: risk.reasons.map((r) => r.code).join(", ") || "action=warn",
        source: "token",
      });
    } else if (risk.action === "info") {
      // clean, no reason
    } else {
      verdict = worse(verdict, "HOLD");
      reasons.push({
        code: "token_action_unrecognized",
        detail: `unexpected action value: ${String((risk as { action: unknown }).action)}`,
        source: "token",
      });
    }
  });

  return { verdict, reasons };
}

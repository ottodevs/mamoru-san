import { worse } from "./rules.ts";
import { screenAddress } from "./screen-address.ts";
import { screenMessage } from "./screen-message.ts";
import { screenSpend } from "./screen-spend.ts";
import { screenToken } from "./screen-token.ts";
import type { PartResult, Reason, ScreenInput, ScreenResult, Verdict } from "./types.ts";

/**
 * Combines whichever parts are present into one verdict: most severe wins
 * (REFUSE > HOLD > CAP > PAY). Callers pass only the parts relevant to them —
 * the seller screens `address` only, the buyer screens all four.
 */
export function screen(input: ScreenInput): ScreenResult {
  const riskParts: PartResult[] = [];

  if (input.address) riskParts.push(screenAddress(input.address));
  if (input.token) riskParts.push(screenToken(input.token));
  if (input.message !== undefined) riskParts.push(screenMessage(input.message));

  const riskVerdict = riskParts.reduce<Verdict>((acc, part) => worse(acc, part.verdict), "PAY");

  const parts = [...riskParts];
  if (input.spend) {
    parts.push(screenSpend({ ...input.spend, riskVerdict }));
  }

  const verdict = parts.reduce<Verdict>((acc, part) => worse(acc, part.verdict), "PAY");
  const reasons: Reason[] = parts.flatMap((part) => part.reasons);

  return { verdict, reasons };
}

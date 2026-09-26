import { isScanFailure, type Scan, type TokenRisk } from "@mamoru-san/screen";
import { callIntercepta } from "./http.ts";
import { normalizeTokenRisk } from "./normalize.ts";

/** `GET /token-intelligence/token/{address}/risks?chainId=8453` — default chainId is Base mainnet. */
export async function tokenRisks(address: string, chainId = 8453): Promise<Scan<TokenRisk>> {
  const result = await callIntercepta(
    `/token-intelligence/token/${encodeURIComponent(address)}/risks?chainId=${chainId}`,
    { method: "GET" },
  );
  if (isScanFailure(result)) return result;
  return normalizeTokenRisk(result.body);
}

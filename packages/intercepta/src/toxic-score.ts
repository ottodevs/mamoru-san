import { isScanFailure, type AddressScan, type Scan } from "@mamoru-san/screen";
import { callIntercepta } from "./http.ts";
import { normalizeAddressScan } from "./normalize.ts";

/** `GET /account/{address}/toxic-score` — sanctions/mixer/scam signal. */
export async function toxicScore(address: string): Promise<Scan<AddressScan>> {
  const result = await callIntercepta(`/account/${encodeURIComponent(address)}/toxic-score`, { method: "GET" });
  if (isScanFailure(result)) return result;
  return normalizeAddressScan(result.body);
}

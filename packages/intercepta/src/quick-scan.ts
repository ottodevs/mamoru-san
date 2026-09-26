import { isScanFailure, type AddressScan, type Scan } from "@mamoru-san/screen";
import { callIntercepta } from "./http.ts";
import { normalizeAddressScan } from "./normalize.ts";

/** `GET /account/{address}/quick-scan` — used to screen `payTo` / a payer. */
export async function quickScan(address: string): Promise<Scan<AddressScan>> {
  const result = await callIntercepta(`/account/${encodeURIComponent(address)}/quick-scan`, { method: "GET" });
  if (isScanFailure(result)) return result;
  return normalizeAddressScan(result.body);
}

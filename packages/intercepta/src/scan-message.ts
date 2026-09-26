import { isScanFailure, type MessageScan, type Scan } from "@mamoru-san/screen";
import { callIntercepta } from "./http.ts";
import { normalizeMessageScan } from "./normalize.ts";
import type { Eip712TypedData } from "./types.ts";

/**
 * `POST /analysis/signature` — the endpoint requires a `from` (signature
 * owner) field. We default it to `typedData.message.from` (true for the
 * EIP-3009 TransferWithAuthorization message the buyer builds), or it can be
 * passed explicitly via `opts.from`.
 */
export async function scanMessage(
  typedData: Eip712TypedData,
  chainId: number,
  opts?: { readonly from?: string; readonly website?: string },
): Promise<Scan<MessageScan>> {
  const from = opts?.from ?? (typeof typedData.message.from === "string" ? typedData.message.from : undefined);
  if (!from) {
    return { kind: "bad_body", detail: "scanMessage requires a `from` address (opts.from or typedData.message.from)" };
  }

  const result = await callIntercepta(`/analysis/signature`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      message: JSON.stringify(typedData),
      chainId: String(chainId),
      ...(opts?.website ? { website: opts.website } : {}),
    }),
  });
  if (isScanFailure(result)) return result;
  return normalizeMessageScan(result.body);
}

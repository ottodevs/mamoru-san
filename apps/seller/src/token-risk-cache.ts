import { tokenRisks } from "@mamoru-san/intercepta";
import type { Scan, TokenRisk } from "@mamoru-san/screen";

const TTL_MS = 10 * 60 * 1000; // 10 minutes, per the model doc's key budget.

interface CacheEntry {
  readonly value: Scan<TokenRisk>;
  readonly expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** In-memory, 10-minute cache for token-risks verdicts used by the card.
 * The pay-screening path (onBeforeSettle) never caches. */
export async function cachedTokenRisks(address: string, chainId: number): Promise<Scan<TokenRisk>> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await tokenRisks(address, chainId);
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

export function clearTokenRiskCache(): void {
  cache.clear();
}

import { quickScan, toxicScore } from "@mamoru-san/intercepta";
import { screen } from "@mamoru-san/screen";

/**
 * CDP Bazaar public discovery endpoint (facilitator path `/discovery/resources`).
 * No API key needed to read it — "Bazaar discovery is public. You do not
 * need a CDP API key to use the discovery APIs."
 * (https://docs.cdp.coinbase.com/x402/bazaar). Verified live with a plain
 * curl on 2026-09-26: HTTP 200, ~17.6k resources indexed
 * (`pagination.total`), `limit` below 20 is clamped up to 20 server-side —
 * we always slice to the requested count client-side.
 */
const BAZAAR_DISCOVERY_URL = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";

export interface BazaarAccept {
  readonly payTo?: string;
}

export interface BazaarResource {
  readonly resource: string;
  readonly accepts?: readonly BazaarAccept[];
}

interface BazaarListResponse {
  readonly items?: readonly BazaarResource[];
}

/** Fetches the first `limit` resources from the Bazaar discovery list. */
export async function fetchBazaarResources(limit: number): Promise<readonly BazaarResource[]> {
  const url = `${BAZAAR_DISCOVERY_URL}?limit=${encodeURIComponent(String(limit))}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bazaar discovery request failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as BazaarListResponse;
  return (body.items ?? []).slice(0, limit);
}

/** The first non-empty `payTo` among a resource's declared payment options. */
export function resourcePayTo(resource: BazaarResource): string | undefined {
  for (const accept of resource.accepts ?? []) {
    if (typeof accept.payTo === "string" && accept.payTo.length > 0) {
      return accept.payTo;
    }
  }
  return undefined;
}

export interface DiscoverRow {
  readonly resource: string;
  readonly payTo?: string;
  readonly verdict: string;
  readonly reasons: string;
}

/**
 * Takes the first `limit` Bazaar resources and screens each UNIQUE `payTo`
 * with quickScan + toxicScore (address screening only, via packages/screen).
 * Never signs or pays — read-only directory screening.
 */
export async function discoverAndScreen(limit: number): Promise<readonly DiscoverRow[]> {
  const resources = await fetchBazaarResources(limit);
  const verdictCache = new Map<string, { readonly verdict: string; readonly reasons: string }>();
  const rows: DiscoverRow[] = [];

  for (const resource of resources) {
    const payTo = resourcePayTo(resource);
    if (!payTo) {
      rows.push({ resource: resource.resource, payTo: undefined, verdict: "-", reasons: "no payTo in accepts[]" });
      continue;
    }

    const key = payTo.toLowerCase();
    let entry = verdictCache.get(key);
    if (!entry) {
      const [quickScanResult, toxicScoreResult] = await Promise.all([quickScan(payTo), toxicScore(payTo)]);
      const result = screen({ address: { quickScan: quickScanResult, toxicScore: toxicScoreResult } });
      entry = {
        verdict: result.verdict,
        reasons: result.reasons.map((r) => `${r.source}/${r.code}: ${r.detail}`).join("; ") || "(clean)",
      };
      verdictCache.set(key, entry);
    }
    rows.push({ resource: resource.resource, payTo, verdict: entry.verdict, reasons: entry.reasons });
  }

  return rows;
}

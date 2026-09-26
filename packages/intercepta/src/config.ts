export const BASE_URL = "https://api.web3antivirus.io/api/public/v2/extension";
// First scan of an unseen address took >4s live; warm scans ~150ms.
export const TIMEOUT_MS = Number(process.env.INTERCEPTA_TIMEOUT_MS) || 10_000;

/** Read lazily (not cached) so tests can toggle INTERCEPTA_API_KEY per case. */
export function getApiKey(): string | undefined {
  const key = process.env.INTERCEPTA_API_KEY;
  return key && key.length > 0 ? key : undefined;
}

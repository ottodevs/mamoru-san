export const BASE_URL = "https://api.web3antivirus.io/api/public/v2/extension";
export const TIMEOUT_MS = 4_000;

/** Read lazily (not cached) so tests can toggle INTERCEPTA_API_KEY per case. */
export function getApiKey(): string | undefined {
  const key = process.env.INTERCEPTA_API_KEY;
  return key && key.length > 0 ? key : undefined;
}

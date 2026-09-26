import type { ScanFailure } from "@mamoru-san/screen";
import { getBudget, isBudgetExhausted, nextCallCount } from "./budget.ts";
import { BASE_URL, TIMEOUT_MS, getApiKey } from "./config.ts";

export interface ApiSuccess {
  readonly status: number;
  readonly body: unknown;
}

export type ApiResult = ApiSuccess | ScanFailure;

/** One JSON line per Intercepta call, to stderr, for the README evidence log. */
function logCall(endpoint: string, latencyMs: number, status: number | string, count: number): void {
  console.error(JSON.stringify({ endpoint, latencyMs, status, count }));
}

/**
 * Calls one Intercepta endpoint. Never throws.
 *
 * Fails closed in two ways, checked in order:
 * 1. Once the process-wide request budget (`INTERCEPTA_BUDGET`, default 50)
 *    is exceeded, this returns `{ kind: "budget_exhausted" }` WITHOUT
 *    checking the API key or making a network call. See budget.ts.
 * 2. With no INTERCEPTA_API_KEY, this returns `{ kind: "no_api_key" }`
 *    WITHOUT making a network call.
 *
 * A 403 maps to `forbidden`, a timeout (4s) to `timeout`, and any non-2xx
 * status or unparseable body to `bad_body`.
 */
export async function callIntercepta(path: string, init: RequestInit & { method: string }): Promise<ApiResult> {
  const count = nextCallCount();
  if (isBudgetExhausted(count)) {
    logCall(path, 0, "budget_exhausted", count);
    return { kind: "budget_exhausted", detail: `INTERCEPTA_BUDGET (${getBudget()}) exceeded at call ${count}` };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    logCall(path, 0, "no_api_key", count);
    return { kind: "no_api_key", detail: "INTERCEPTA_API_KEY is not set" };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = performance.now();

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "X-API-KEY": apiKey, ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    logCall(path, latencyMs, res.status, count);

    if (res.status === 403) {
      return { kind: "forbidden", detail: `HTTP 403 from ${path}` };
    }
    if (!res.ok) {
      return { kind: "bad_body", detail: `HTTP ${res.status} from ${path}` };
    }

    try {
      const body: unknown = await res.json();
      return { status: res.status, body };
    } catch {
      return { kind: "bad_body", detail: `non-JSON body from ${path}` };
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    if (error instanceof Error && error.name === "AbortError") {
      logCall(path, latencyMs, "timeout", count);
      return { kind: "timeout", detail: `aborted after ${TIMEOUT_MS}ms` };
    }
    logCall(path, latencyMs, "error", count);
    return { kind: "bad_body", detail: error instanceof Error ? error.message : "unknown fetch error" };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

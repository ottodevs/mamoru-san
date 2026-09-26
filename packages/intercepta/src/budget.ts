/**
 * Process-wide request budget guard.
 *
 * Every `callIntercepta` invocation consumes one unit, regardless of outcome
 * (including a call that would otherwise fail closed with `no_api_key`).
 * Once the budget is exceeded, further calls fail closed with
 * `budget_exhausted` instead of proceeding to the API-key check or a network
 * request. This protects a finite Intercepta API key budget (see the model
 * doc's ~1,000 request allowance) and guards against runaway loops in one
 * process, e.g. `--discover --limit 100000`.
 *
 * `INTERCEPTA_BUDGET` (default 50) sets the ceiling. Read lazily (not
 * cached) so tests can toggle it per case, same as `getApiKey` in config.ts.
 */

const DEFAULT_BUDGET = 50;

let callCount = 0;

/** The configured per-process request budget (default 50). */
export function getBudget(): number {
  const raw = process.env.INTERCEPTA_BUDGET;
  if (!raw) return DEFAULT_BUDGET;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUDGET;
}

/** Increments the process-wide call counter and returns the new count. */
export function nextCallCount(): number {
  callCount += 1;
  return callCount;
}

/** True once `count` has exceeded the configured budget. */
export function isBudgetExhausted(count: number): boolean {
  return count > getBudget();
}

/** Test-only: resets the process-wide counter back to zero. */
export function resetBudgetForTest(): void {
  callCount = 0;
}

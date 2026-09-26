// Process-wide request budget guard: once INTERCEPTA_BUDGET calls have been
// made (success or failure alike), further calls must fail closed with
// `budget_exhausted` WITHOUT even checking the API key.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isScanFailure } from "@mamoru-san/screen";
import { getBudget, resetBudgetForTest } from "../src/budget.ts";
import { quickScan } from "../src/quick-scan.ts";

const ORIGINAL_BUDGET = process.env.INTERCEPTA_BUDGET;
const ORIGINAL_KEY = process.env.INTERCEPTA_API_KEY;
const ORIGINAL_FETCH = globalThis.fetch;
const ADDRESS = "0x000000000000000000000000000000000000aa";

beforeEach(() => {
  // No key needed: the budget check runs before the API-key check, so this
  // is deterministic without mocking fetch.
  delete process.env.INTERCEPTA_API_KEY;
  resetBudgetForTest();
});

afterEach(() => {
  resetBudgetForTest();
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_BUDGET === undefined) {
    delete process.env.INTERCEPTA_BUDGET;
  } else {
    process.env.INTERCEPTA_BUDGET = ORIGINAL_BUDGET;
  }
  if (ORIGINAL_KEY === undefined) {
    delete process.env.INTERCEPTA_API_KEY;
  } else {
    process.env.INTERCEPTA_API_KEY = ORIGINAL_KEY;
  }
});

describe("getBudget", () => {
  test("defaults to 50 when INTERCEPTA_BUDGET is unset", () => {
    delete process.env.INTERCEPTA_BUDGET;
    expect(getBudget()).toBe(50);
  });

  test("defaults to 50 for a non-numeric or non-positive value", () => {
    process.env.INTERCEPTA_BUDGET = "not-a-number";
    expect(getBudget()).toBe(50);
    process.env.INTERCEPTA_BUDGET = "0";
    expect(getBudget()).toBe(50);
    process.env.INTERCEPTA_BUDGET = "-3";
    expect(getBudget()).toBe(50);
  });

  test("honors a configured positive value", () => {
    process.env.INTERCEPTA_BUDGET = "7";
    expect(getBudget()).toBe(7);
  });
});

describe("request budget guard", () => {
  test("calls up to the budget succeed normally (fail closed on no_api_key, not budget)", async () => {
    process.env.INTERCEPTA_BUDGET = "2";

    const first = await quickScan(ADDRESS);
    const second = await quickScan(ADDRESS);

    expect(first).toEqual({ kind: "no_api_key", detail: "INTERCEPTA_API_KEY is not set" });
    expect(second).toEqual({ kind: "no_api_key", detail: "INTERCEPTA_API_KEY is not set" });
  });

  test("the call past the budget fails closed with budget_exhausted", async () => {
    process.env.INTERCEPTA_BUDGET = "2";

    await quickScan(ADDRESS);
    await quickScan(ADDRESS);
    const third = await quickScan(ADDRESS);

    expect(isScanFailure(third)).toBe(true);
    expect(third).toMatchObject({ kind: "budget_exhausted" });
  });

  test("budget_exhausted is checked before the API key, even with a key set", async () => {
    process.env.INTERCEPTA_BUDGET = "1";
    process.env.INTERCEPTA_API_KEY = "irrelevant-because-budget-runs-first";
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called once the budget is exhausted");
    }) as unknown as typeof fetch;

    await quickScan(ADDRESS); // consumes the only unit of budget
    const second = await quickScan(ADDRESS);

    expect(second).toMatchObject({ kind: "budget_exhausted" });
  });
});

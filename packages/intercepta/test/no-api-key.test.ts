// Runtime fail-closed guarantee: with no INTERCEPTA_API_KEY, every live call
// must return `{ kind: "no_api_key" }` WITHOUT making a network request.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isScanFailure } from "@mamoru-san/screen";
import { quickScan } from "../src/quick-scan.ts";
import { toxicScore } from "../src/toxic-score.ts";
import { tokenRisks } from "../src/token-risks.ts";
import { scanMessage } from "../src/scan-message.ts";

const ORIGINAL_KEY = process.env.INTERCEPTA_API_KEY;
const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  delete process.env.INTERCEPTA_API_KEY;
  // If a call somehow reached the network despite the missing key, fail loudly
  // instead of hitting the real API from a test run.
  globalThis.fetch = (() => {
    throw new Error("fetch must not be called when INTERCEPTA_API_KEY is unset");
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) {
    delete process.env.INTERCEPTA_API_KEY;
  } else {
    process.env.INTERCEPTA_API_KEY = ORIGINAL_KEY;
  }
});

describe("fail closed with no INTERCEPTA_API_KEY", () => {
  test("quickScan", async () => {
    const result = await quickScan("0x000000000000000000000000000000000000aa");
    expect(isScanFailure(result)).toBe(true);
    expect(result).toEqual({ kind: "no_api_key", detail: "INTERCEPTA_API_KEY is not set" });
  });

  test("toxicScore", async () => {
    const result = await toxicScore("0x000000000000000000000000000000000000aa");
    expect(result).toEqual({ kind: "no_api_key", detail: "INTERCEPTA_API_KEY is not set" });
  });

  test("tokenRisks", async () => {
    const result = await tokenRisks("0x000000000000000000000000000000000000aa");
    expect(result).toEqual({ kind: "no_api_key", detail: "INTERCEPTA_API_KEY is not set" });
  });

  test("scanMessage", async () => {
    const result = await scanMessage(
      {
        domain: { name: "USD Coin", version: "2", chainId: 84532, verifyingContract: "0x0" },
        types: { TransferWithAuthorization: [{ name: "from", type: "address" }] },
        primaryType: "TransferWithAuthorization",
        message: { from: "0x000000000000000000000000000000000000aa" },
      },
      8453,
    );
    expect(result).toEqual({ kind: "no_api_key", detail: "INTERCEPTA_API_KEY is not set" });
  });
});

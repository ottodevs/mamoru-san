// Fixtures in ../fixtures are hand-written JSON shaped like the documented
// Intercepta quick-scan / toxic-score response schema. They are not live data.
import { describe, expect, test } from "bun:test";
import { screenAddress } from "../src/screen-address.ts";
import type { AddressScan, ScanFailure } from "../src/types.ts";
import addressClean from "../fixtures/address-clean.json" with { type: "json" };
import addressSanctioned from "../fixtures/address-sanctioned.json" with { type: "json" };
import addressScammer from "../fixtures/address-scammer.json" with { type: "json" };
import failureTimeout from "../fixtures/failure-timeout.json" with { type: "json" };
import failureNoApiKey from "../fixtures/failure-no-api-key.json" with { type: "json" };

const clean = addressClean as AddressScan;
const sanctioned = addressSanctioned as AddressScan;
const scammer = addressScammer as AddressScan;
const timeout = failureTimeout as ScanFailure;
const noApiKey = failureNoApiKey as ScanFailure;

describe("screenAddress", () => {
  test("clean quick-scan and toxic-score -> PAY, no reasons", () => {
    const result = screenAddress({ quickScan: clean, toxicScore: clean });
    expect(result.verdict).toBe("PAY");
    expect(result.reasons).toEqual([]);
  });

  test("deny trait on quick-scan -> REFUSE", () => {
    const result = screenAddress({ quickScan: sanctioned, toxicScore: clean });
    expect(result.verdict).toBe("REFUSE");
    expect(result.reasons).toEqual([{ code: "deny_trait", detail: "sanction_address (quick-scan)", source: "address" }]);
  });

  test("deny trait on toxic-score -> REFUSE", () => {
    const result = screenAddress({ quickScan: clean, toxicScore: scammer });
    expect(result.verdict).toBe("REFUSE");
    expect(result.reasons[0]?.code).toBe("deny_trait");
  });

  test("a failed call -> HOLD with the failure kind as reason code", () => {
    const result = screenAddress({ quickScan: timeout, toxicScore: clean });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toEqual([{ code: "timeout", detail: "aborted after 4000ms", source: "address" }]);
  });

  test("no_api_key on either call -> HOLD with reason no_api_key (fail closed)", () => {
    const result = screenAddress({ quickScan: noApiKey, toxicScore: noApiKey });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons.every((r) => r.code === "no_api_key")).toBe(true);
  });

  test("REFUSE outranks a failure on the other call (most severe wins)", () => {
    const result = screenAddress({ quickScan: sanctioned, toxicScore: timeout });
    expect(result.verdict).toBe("REFUSE");
    expect(result.reasons).toHaveLength(2);
  });
});

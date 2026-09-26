// Fixtures in ../fixtures are hand-written JSON shaped like the documented
// Intercepta response schemas. They are not live data. These tests exercise
// screen() the way the seller and buyer apps actually call it.
import { describe, expect, test } from "bun:test";
import { screen } from "../src/screen.ts";
import type { AddressScan, MessageScan, ScanFailure, TokenRisk } from "../src/types.ts";
import addressClean from "../fixtures/address-clean.json" with { type: "json" };
import addressSanctioned from "../fixtures/address-sanctioned.json" with { type: "json" };
import tokenInfo from "../fixtures/token-info.json" with { type: "json" };
import tokenWarn from "../fixtures/token-warn.json" with { type: "json" };
import messageLowUnclassified from "../fixtures/message-low-unclassified.json" with { type: "json" };
import failureNoApiKey from "../fixtures/failure-no-api-key.json" with { type: "json" };

const clean = addressClean as AddressScan;
const sanctioned = addressSanctioned as AddressScan;
const info = tokenInfo as TokenRisk;
const warn = tokenWarn as TokenRisk;
const unclassified = messageLowUnclassified as MessageScan;
const noApiKey = failureNoApiKey as ScanFailure;

const PAY_TO = "0x000000000000000000000000000000000000aa";

describe("screen (seller shape: address only)", () => {
  test("clean payer -> PAY", () => {
    const result = screen({ address: { quickScan: clean, toxicScore: clean } });
    expect(result.verdict).toBe("PAY");
  });

  test("denied payer -> REFUSE, seller aborts settle", () => {
    const result = screen({ address: { quickScan: sanctioned, toxicScore: clean } });
    expect(result.verdict).toBe("REFUSE");
  });

  test("no key -> HOLD with reason no_api_key (fail closed)", () => {
    const result = screen({ address: { quickScan: noApiKey, toxicScore: noApiKey } });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons.some((r) => r.code === "no_api_key")).toBe(true);
  });
});

describe("screen (buyer shape: address + token + message + spend)", () => {
  test("all clean, within cap, allowlisted -> PAY", () => {
    const result = screen({
      address: { quickScan: clean, toxicScore: clean },
      token: [info],
      message: unclassified,
      spend: { amountAtomic: 1_000n, payTo: PAY_TO, allowlist: [PAY_TO] },
    });
    expect(result.verdict).toBe("PAY");
    // message_unclassified is recorded, but did not block the PAY.
    expect(result.reasons.some((r) => r.code === "message_unclassified")).toBe(true);
  });

  test("token warn -> CAP, and CAP lowers the spend cap to 0.001 USDC", () => {
    const overReducedCap = screen({
      address: { quickScan: clean, toxicScore: clean },
      token: [warn],
      message: unclassified,
      spend: { amountAtomic: 1_001n, payTo: PAY_TO, allowlist: [PAY_TO] },
    });
    expect(overReducedCap.verdict).toBe("HOLD"); // CAP escalated to HOLD because amount exceeds the reduced cap
    expect(overReducedCap.reasons.some((r) => r.code === "spend_over_cap")).toBe(true);

    const withinReducedCap = screen({
      address: { quickScan: clean, toxicScore: clean },
      token: [warn],
      message: unclassified,
      spend: { amountAtomic: 1_000n, payTo: PAY_TO, allowlist: [PAY_TO] },
    });
    expect(withinReducedCap.verdict).toBe("CAP");
  });

  test("denied payTo -> REFUSE regardless of spend policy", () => {
    const result = screen({
      address: { quickScan: sanctioned, toxicScore: clean },
      token: [info],
      message: unclassified,
      spend: { amountAtomic: 1n, payTo: PAY_TO, allowlist: [PAY_TO] },
    });
    expect(result.verdict).toBe("REFUSE");
  });

  test("no key anywhere -> HOLD with reason no_api_key, buyer never signs", () => {
    const result = screen({
      address: { quickScan: noApiKey, toxicScore: noApiKey },
      token: [noApiKey],
      message: noApiKey,
      spend: { amountAtomic: 1_000n, payTo: PAY_TO, allowlist: [PAY_TO] },
    });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons.every((r) => r.code === "no_api_key")).toBe(true);
  });

  test("empty input -> PAY (vacuous; callers only pass the parts they screen)", () => {
    expect(screen({}).verdict).toBe("PAY");
  });
});

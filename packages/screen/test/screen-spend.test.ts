import { describe, expect, test } from "bun:test";
import { screenSpend } from "../src/screen-spend.ts";

const PAY_TO = "0x000000000000000000000000000000000000aa";
const ALLOWLIST = [PAY_TO];

describe("screenSpend", () => {
  test("within base cap, allowlisted, risk clean -> PAY", () => {
    const result = screenSpend({ amountAtomic: 1_000n, payTo: PAY_TO, allowlist: ALLOWLIST, riskVerdict: "PAY" });
    expect(result.verdict).toBe("PAY");
    expect(result.reasons).toEqual([]);
  });

  test("at exactly the base cap (0.005 USDC) -> PAY", () => {
    const result = screenSpend({ amountAtomic: 5_000n, payTo: PAY_TO, allowlist: ALLOWLIST, riskVerdict: "PAY" });
    expect(result.verdict).toBe("PAY");
  });

  test("above the base cap -> HOLD", () => {
    const result = screenSpend({ amountAtomic: 5_001n, payTo: PAY_TO, allowlist: ALLOWLIST, riskVerdict: "PAY" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons[0]?.code).toBe("spend_over_cap");
  });

  test("risk verdict CAP lowers the cap to 0.001 USDC", () => {
    const withinReduced = screenSpend({ amountAtomic: 1_000n, payTo: PAY_TO, allowlist: ALLOWLIST, riskVerdict: "CAP" });
    expect(withinReduced.verdict).toBe("PAY");

    const overReduced = screenSpend({ amountAtomic: 1_001n, payTo: PAY_TO, allowlist: ALLOWLIST, riskVerdict: "CAP" });
    expect(overReduced.verdict).toBe("HOLD");
    expect(overReduced.reasons[0]?.detail).toContain("reduced cap");
  });

  test("payTo outside the allowlist -> HOLD, even within cap", () => {
    const result = screenSpend({ amountAtomic: 100n, payTo: "0xdead", allowlist: ALLOWLIST, riskVerdict: "PAY" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons[0]?.code).toBe("spend_payto_not_allowlisted");
  });

  test("allowlist match is case-insensitive", () => {
    const result = screenSpend({
      amountAtomic: 100n,
      payTo: PAY_TO.toUpperCase(),
      allowlist: ALLOWLIST,
      riskVerdict: "PAY",
    });
    expect(result.verdict).toBe("PAY");
  });

  test("both over cap and not allowlisted -> HOLD with both reasons", () => {
    const result = screenSpend({ amountAtomic: 10_000n, payTo: "0xdead", allowlist: ALLOWLIST, riskVerdict: "PAY" });
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toHaveLength(2);
  });
});

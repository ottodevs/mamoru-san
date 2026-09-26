// Fixtures in ../fixtures are hand-written JSON shaped like the documented
// Intercepta token-risks response schema. They are not live data.
import { describe, expect, test } from "bun:test";
import { screenToken } from "../src/screen-token.ts";
import type { ScanFailure, TokenRisk } from "../src/types.ts";
import tokenBlock from "../fixtures/token-block.json" with { type: "json" };
import tokenWarn from "../fixtures/token-warn.json" with { type: "json" };
import tokenInfo from "../fixtures/token-info.json" with { type: "json" };
import failureBadBody from "../fixtures/failure-bad-body.json" with { type: "json" };

const block = tokenBlock as TokenRisk;
const warn = tokenWarn as TokenRisk;
const info = tokenInfo as TokenRisk;
const badBody = failureBadBody as ScanFailure;

describe("screenToken", () => {
  test("action info on all tokens -> PAY, no reasons", () => {
    const result = screenToken([info, info]);
    expect(result.verdict).toBe("PAY");
    expect(result.reasons).toEqual([]);
  });

  test("action warn -> CAP", () => {
    const result = screenToken([info, warn]);
    expect(result.verdict).toBe("CAP");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.code).toBe("token_warn");
  });

  test("action block -> REFUSE, outranks a warn on the other token", () => {
    const result = screenToken([warn, block]);
    expect(result.verdict).toBe("REFUSE");
    expect(result.reasons.some((r) => r.code === "token_block")).toBe(true);
  });

  test("a failed call -> HOLD", () => {
    const result = screenToken([badBody]);
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toEqual([{ code: "bad_body", detail: "response body missing required fields", source: "token" }]);
  });

  test("an unrecognized action value -> HOLD (defensive default)", () => {
    const malformed = { action: "unknown", reasons: [] } as unknown as TokenRisk;
    const result = screenToken([malformed]);
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons[0]?.code).toBe("token_action_unrecognized");
  });

  test("empty input -> PAY", () => {
    const result = screenToken([]);
    expect(result.verdict).toBe("PAY");
    expect(result.reasons).toEqual([]);
  });
});

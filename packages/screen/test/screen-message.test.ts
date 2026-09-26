// Fixtures in ../fixtures are hand-written JSON shaped like the documented
// Intercepta scan-message response schema. They are not live data.
import { describe, expect, test } from "bun:test";
import { screenMessage } from "../src/screen-message.ts";
import type { MessageScan, ScanFailure } from "../src/types.ts";
import msgLowClassified from "../fixtures/message-low-classified.json" with { type: "json" };
import msgLowUnclassified from "../fixtures/message-low-unclassified.json" with { type: "json" };
import msgLowClassifiedWithDetectors from "../fixtures/message-low-classified-with-detectors.json" with { type: "json" };
import msgMedium from "../fixtures/message-medium.json" with { type: "json" };
import msgHighDrainer from "../fixtures/message-high-drainer.json" with { type: "json" };
import msgHighOther from "../fixtures/message-high-other.json" with { type: "json" };
import failureNoApiKey from "../fixtures/failure-no-api-key.json" with { type: "json" };

const lowClassified = msgLowClassified as MessageScan;
const lowUnclassified = msgLowUnclassified as MessageScan;
const lowClassifiedWithDetectors = msgLowClassifiedWithDetectors as MessageScan;
const medium = msgMedium as MessageScan;
const highDrainer = msgHighDrainer as MessageScan;
const highOther = msgHighOther as MessageScan;
const noApiKey = failureNoApiKey as ScanFailure;

describe("screenMessage", () => {
  test("Low + classified messageType + no detectors -> PAY, no reasons", () => {
    const result = screenMessage(lowClassified);
    expect(result.verdict).toBe("PAY");
    expect(result.reasons).toEqual([]);
  });

  test("Low + no messageType (unclassified, expected for EIP-3009) -> PAY, but recorded as a reason (not a block)", () => {
    const result = screenMessage(lowUnclassified);
    expect(result.verdict).toBe("PAY");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.code).toBe("message_unclassified");
  });

  test("Low + classified + detectors present -> CAP", () => {
    const result = screenMessage(lowClassifiedWithDetectors);
    expect(result.verdict).toBe("CAP");
    expect(result.reasons[0]?.code).toBe("message_detectors_present");
  });

  test("Medium -> CAP", () => {
    const result = screenMessage(medium);
    expect(result.verdict).toBe("CAP");
    expect(result.reasons[0]?.code).toBe("message_medium_risk");
  });

  test("High + WALLET_DRAINER -> REFUSE", () => {
    const result = screenMessage(highDrainer);
    expect(result.verdict).toBe("REFUSE");
    expect(result.reasons[0]?.code).toBe("message_wallet_drainer");
  });

  test("High without WALLET_DRAINER -> HOLD", () => {
    const result = screenMessage(highOther);
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons[0]?.code).toBe("message_high_risk");
  });

  test("a failed call (including no_api_key) -> HOLD, unlike the unclassified case", () => {
    const result = screenMessage(noApiKey);
    expect(result.verdict).toBe("HOLD");
    expect(result.reasons).toEqual([{ code: "no_api_key", detail: "INTERCEPTA_API_KEY is not set", source: "message" }]);
  });
});

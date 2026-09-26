import type { AddressScan, MessageScan, Scan, TokenRisk } from "@mamoru-san/screen";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * quick-scan and toxic-score document the same response schema:
 * `{ toxicScore: number, traits: { name, risk, txsCount, description }[] }`.
 */
export function normalizeAddressScan(body: unknown): Scan<AddressScan> {
  if (!isRecord(body) || typeof body.toxicScore !== "number" || !Array.isArray(body.traits)) {
    return { kind: "bad_body", detail: "quick-scan/toxic-score response missing toxicScore/traits" };
  }
  const traits = body.traits.map((trait) => {
    const t = isRecord(trait) ? trait : {};
    return {
      name: typeof t.name === "string" ? t.name : "",
      risk: typeof t.risk === "number" ? t.risk : undefined,
    };
  });
  return { toxicScore: body.toxicScore, traits };
}

/**
 * token-risks documents `action: block|warn|info` and a `detectors: { code,
 * description }[]` array (NOT a `reasons` field as an earlier draft assumed —
 * see README "API feedback"). We normalize `detectors` into `reasons`.
 */
export function normalizeTokenRisk(body: unknown): Scan<TokenRisk> {
  if (!isRecord(body) || (body.action !== "block" && body.action !== "warn" && body.action !== "info")) {
    return { kind: "bad_body", detail: "token-risks response missing a valid action field" };
  }
  const rawDetectors = Array.isArray(body.detectors) ? body.detectors : [];
  const reasons = rawDetectors.map((detector) => {
    const d = isRecord(detector) ? detector : {};
    return {
      code: typeof d.code === "string" ? d.code : "unknown",
      detail: typeof d.description === "string" ? d.description : "",
    };
  });
  return { action: body.action, reasons };
}

/**
 * scan-message documents `riskGroup: Low|Medium|High`, `detectors: { code,
 * description }[]`, and an optional `messageType` (only present when the
 * payload matches a documented Permit/Permit2 type).
 */
export function normalizeMessageScan(body: unknown): Scan<MessageScan> {
  if (!isRecord(body) || (body.riskGroup !== "Low" && body.riskGroup !== "Medium" && body.riskGroup !== "High")) {
    return { kind: "bad_body", detail: "scan-message response missing a valid riskGroup field" };
  }
  const rawDetectors = Array.isArray(body.detectors) ? body.detectors : [];
  const detectors = rawDetectors
    .map((detector) => {
      const d = isRecord(detector) ? detector : {};
      return typeof d.code === "string" ? d.code : "";
    })
    .filter((code): code is string => code.length > 0);
  const messageType = typeof body.messageType === "string" ? body.messageType : undefined;
  return { riskGroup: body.riskGroup, detectors, messageType };
}

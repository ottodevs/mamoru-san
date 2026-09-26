import { describe, expect, test } from "bun:test";
import { worse } from "../src/rules.ts";
import type { Verdict } from "../src/types.ts";

describe("worse", () => {
  test("severity order is REFUSE > HOLD > CAP > PAY", () => {
    const order: Verdict[] = ["PAY", "CAP", "HOLD", "REFUSE"];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        const a = order[i] as Verdict;
        const b = order[j] as Verdict;
        expect(worse(a, b)).toBe(i >= j ? a : b);
      }
    }
  });
});

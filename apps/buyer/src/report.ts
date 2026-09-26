import type { ScreenResult } from "@mamoru-san/screen";

/** Prints the verdict + reasons as a plain table, to stdout. */
export function printVerdictTable(result: ScreenResult): void {
  console.log(`\nVerdict: ${result.verdict}`);
  if (result.reasons.length === 0) {
    console.log("  (clean — no reasons)");
    return;
  }
  console.log("  source   code                          detail");
  for (const reason of result.reasons) {
    console.log(`  ${reason.source.padEnd(8)} ${reason.code.padEnd(29)} ${reason.detail}`);
  }
}

export function printCard(card: unknown): void {
  console.log("\nCard:");
  console.log(JSON.stringify(card, null, 2));
}

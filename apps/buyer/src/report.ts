import type { ScreenResult } from "@mamoru-san/screen";
import type { DiscoverRow } from "./discover.ts";

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

/** Prints the --discover table: resource / payTo / verdict / reasons. */
export function printDiscoverTable(rows: readonly DiscoverRow[]): void {
  if (rows.length === 0) {
    console.log("(no resources returned)");
    return;
  }
  console.log(`resource${" ".repeat(45)}payTo${" ".repeat(38)}verdict  reasons`);
  for (const row of rows) {
    const resource = row.resource.length > 50 ? `${row.resource.slice(0, 47)}...` : row.resource.padEnd(50);
    const payTo = (row.payTo ?? "(none)").padEnd(42);
    const verdict = row.verdict.padEnd(8);
    console.log(`${resource} ${payTo} ${verdict} ${row.reasons}`);
  }
}

import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { discoverAndScreen } from "./discover.ts";
import { printCard, printDiscoverTable, printVerdictTable } from "./report.ts";
import { screenBeforePayment } from "./policy.ts";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function parseAllowlist(): string[] {
  return (process.env.BUYER_PAYTO_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Discovery mode: reads the public Bazaar list, takes the first `limit`
 * resources, and screens each unique `payTo` (quickScan + toxicScore).
 * Never pays.
 */
async function runDiscover(limit: number): Promise<void> {
  const rows = await discoverAndScreen(limit);
  printDiscoverTable(rows);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--discover")) {
    const limitIndex = args.indexOf("--limit");
    const limitArg = limitIndex !== -1 ? args[limitIndex + 1] : undefined;
    const limit = limitArg !== undefined ? Number(limitArg) : 5;
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error("usage: bun apps/buyer/src/cli.ts --discover [--limit N]  (N must be a positive integer)");
      process.exitCode = 1;
      return;
    }
    try {
      await runDiscover(limit);
    } catch (error) {
      console.error(`Discover failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }

  const url = args[0];
  if (!url) {
    console.error("usage: bun apps/buyer/src/cli.ts <url>\n       bun apps/buyer/src/cli.ts --discover [--limit N]");
    process.exitCode = 1;
    return;
  }

  const privateKey = requiredEnv("BUYER_PRIVATE_KEY") as `0x${string}`;
  const signer = privateKeyToAccount(privateKey);
  const allowlist = parseAllowlist();

  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  client.onBeforePaymentCreation(async (ctx) => {
    const result = await screenBeforePayment(ctx, { from: signer.address, allowlist });
    printVerdictTable(result);

    if (result.verdict !== "PAY") {
      const summary = result.reasons.map((r) => `${r.source}/${r.code}: ${r.detail}`).join("; ") || result.verdict;
      return { abort: true, reason: `${result.verdict}: ${summary}` };
    }
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  try {
    const response = await fetchWithPayment(url);
    if (!response.ok) {
      const body = await response.text();
      console.error(`Request failed: HTTP ${response.status}${body ? `\n${body}` : ""}`);
      process.exitCode = 1;
      return;
    }
    const card: unknown = await response.json();
    printCard(card);
  } catch (error) {
    console.error(`Buyer aborted: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}

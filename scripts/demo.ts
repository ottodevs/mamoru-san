import { join } from "node:path";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { screenBeforePayment } from "../apps/buyer/src/policy.ts";
import { printVerdictTable } from "../apps/buyer/src/report.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SELLER_ENTRY = join(REPO_ROOT, "apps/seller/src/index.ts");

const HONEST_PORT = Number(process.env.DEMO_HONEST_PORT ?? 8787);
const IMPOSTOR_PORT = Number(process.env.DEMO_IMPOSTOR_PORT ?? 8788);

/**
 * Base mainnet Uniswap V3 USDC/WETH 0.05% pool.
 *
 * Verified on-chain (2026-09-26) by calling
 * UniswapV3Factory.getPool(USDC, WETH, 500) with viem against
 * https://mainnet.base.org. Factory address
 * 0x33128a8fC17869897dcE68Ed026d694621f6FDfD is Uniswap's documented Base
 * deployment (https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments).
 * USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, WETH
 * 0x4200000000000000000000000000000000000006. The call returned this pool
 * address, hard-coded here as the demo default.
 */
const DEFAULT_POOL = "0xd0b53D9277642d899DF5C87A3966A349A798F224";

type ScreenResult = Awaited<ReturnType<typeof screenBeforePayment>>;

interface CaseOutcome {
  readonly label: string;
  readonly skipped?: string;
  readonly verdict?: ScreenResult["verdict"];
  readonly reasons?: ScreenResult["reasons"];
  readonly signed: boolean;
  readonly settleTx?: string;
  readonly settleNetwork?: string;
  readonly httpStatus?: number;
  readonly error?: string;
}

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

function spawnSeller(payTo: string, port: number): Bun.Subprocess {
  return Bun.spawn(["bun", SELLER_ENTRY], {
    cwd: REPO_ROOT,
    env: { ...process.env, SELLER_PAY_TO: payTo, PORT: String(port) },
    stdout: "inherit",
    stderr: "inherit",
  });
}

/** Polls until the seller's HTTP port accepts connections, or throws if the child exits first. */
async function waitForServer(port: number, child: Bun.Subprocess, label: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} seller exited early (code ${child.exitCode}) before listening on :${port} — see its output above`);
    }
    try {
      await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`${label} seller did not start listening on :${port} within 8s`);
}

async function killAll(children: readonly Bun.Subprocess[]): Promise<void> {
  for (const child of children) {
    if (child.exitCode === null) {
      try {
        child.kill();
      } catch {
        // already gone
      }
    }
  }
  await Promise.allSettled(children.map((child) => child.exited));
}

/**
 * Runs one buyer pass against a running seller: screens payTo/asset/message
 * before signing (same policy as apps/buyer/src/cli.ts), then reads the
 * settlement receipt (PAYMENT-RESPONSE header) if the card was paid for.
 */
async function runBuyerCase(port: number, poolAddress: string): Promise<CaseOutcome> {
  const privateKeyRaw = process.env.BUYER_PRIVATE_KEY;
  if (!privateKeyRaw) {
    return { label: "buyer", skipped: "BUYER_PRIVATE_KEY is not set", signed: false };
  }
  const signer = privateKeyToAccount(privateKeyRaw as `0x${string}`);
  const allowlist = parseAllowlist();

  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  let lastScreen: ScreenResult | undefined;
  client.onBeforePaymentCreation(async (ctx) => {
    const result = await screenBeforePayment(ctx, { from: signer.address, allowlist });
    lastScreen = result;
    if (result.verdict !== "PAY") {
      const summary = result.reasons.map((r) => `${r.source}/${r.code}: ${r.detail}`).join("; ") || result.verdict;
      return { abort: true as const, reason: `${result.verdict}: ${summary}` };
    }
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const url = `http://localhost:${port}/card/${poolAddress}`;

  try {
    const response = await fetchWithPayment(url);
    const settlementHeader = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
    const settlement = settlementHeader ? decodePaymentResponseHeader(settlementHeader) : undefined;

    return {
      label: "buyer",
      verdict: lastScreen?.verdict,
      reasons: lastScreen?.reasons,
      signed: lastScreen?.verdict === "PAY",
      settleTx: settlement?.transaction,
      settleNetwork: settlement?.network,
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      label: "buyer",
      verdict: lastScreen?.verdict,
      reasons: lastScreen?.reasons,
      signed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printCaseOutcome(outcome: CaseOutcome): void {
  if (outcome.skipped) {
    console.log(`skipped: ${outcome.skipped}`);
    return;
  }
  if (outcome.verdict) {
    printVerdictTable({ verdict: outcome.verdict, reasons: outcome.reasons ?? [] });
  }
  console.log(`Signed: ${outcome.signed}`);
  console.log(`Settle tx: ${outcome.settleTx ?? "(none)"}${outcome.settleNetwork ? ` on ${outcome.settleNetwork}` : ""}`);
  if (outcome.httpStatus !== undefined && outcome.httpStatus >= 400) {
    console.log(`HTTP status: ${outcome.httpStatus}`);
  }
  if (outcome.error) {
    console.log(`Aborted: ${outcome.error}`);
  }
}

function printSummary(outcomes: readonly { readonly label: string; readonly outcome: CaseOutcome }[]): void {
  console.log("\n=== Summary ===");
  console.log("case      verdict   signed   settleTx");
  for (const { label, outcome } of outcomes) {
    const verdict = outcome.skipped ? "skipped" : (outcome.verdict ?? "-");
    const tx = outcome.settleTx ? `${outcome.settleTx.slice(0, 18)}...` : "-";
    console.log(`${label.padEnd(9)} ${verdict.padEnd(9)} ${String(outcome.signed).padEnd(8)} ${tx}`);
  }
}

async function main(): Promise<void> {
  const sellerPayTo = requiredEnv("SELLER_PAY_TO");
  const impostorPayTo = process.env.IMPOSTOR_PAY_TO;

  const poolFlagIndex = process.argv.indexOf("--pool");
  const poolFromFlag = poolFlagIndex !== -1 ? process.argv[poolFlagIndex + 1] : undefined;
  const pool = poolFromFlag ?? DEFAULT_POOL;

  const children: Bun.Subprocess[] = [];
  const results: { readonly label: string; readonly outcome: CaseOutcome }[] = [];

  const onSignal = (signal: NodeJS.Signals, code: number) => {
    process.on(signal, () => {
      void killAll(children).finally(() => process.exit(code));
    });
  };
  onSignal("SIGINT", 130);
  onSignal("SIGTERM", 143);

  try {
    console.log(`=== Case 1: honest seller (payTo=${sellerPayTo}) on :${HONEST_PORT} ===`);
    const honestChild = spawnSeller(sellerPayTo, HONEST_PORT);
    children.push(honestChild);
    await waitForServer(HONEST_PORT, honestChild, "honest");
    const honestOutcome = await runBuyerCase(HONEST_PORT, pool);
    printCaseOutcome(honestOutcome);
    results.push({ label: "honest", outcome: honestOutcome });

    console.log(`\n=== Case 2: impostor seller ===`);
    if (!impostorPayTo) {
      const skip =
        "IMPOSTOR_PAY_TO is not set — get a known-risk Base mainnet address from Intercepta's Discord and set it in .env to run this case";
      console.log(`skipped: ${skip}`);
      results.push({ label: "impostor", outcome: { label: "impostor", skipped: skip, signed: false } });
    } else {
      console.log(`(payTo=${impostorPayTo}) on :${IMPOSTOR_PORT}`);
      const impostorChild = spawnSeller(impostorPayTo, IMPOSTOR_PORT);
      children.push(impostorChild);
      await waitForServer(IMPOSTOR_PORT, impostorChild, "impostor");
      const impostorOutcome = await runBuyerCase(IMPOSTOR_PORT, pool);
      printCaseOutcome(impostorOutcome);
      results.push({ label: "impostor", outcome: impostorOutcome });
    }
  } finally {
    await killAll(children);
  }

  printSummary(results);
}

if (import.meta.main) {
  await main();
}

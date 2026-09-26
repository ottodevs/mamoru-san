import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402ResourceServer, type RoutesConfig } from "@x402/core/server";
import { isEIP3009Payload, type ExactEvmPayloadV2 } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddleware } from "@x402/hono";
import { quickScan, toxicScore } from "@mamoru-san/intercepta";
import { screen } from "@mamoru-san/screen";
import { Hono } from "hono";
import { buildCard } from "./card.ts";
import { createRpcClient } from "./pool.ts";

const FACILITATOR_URL = "https://x402.org/facilitator"; // demo facilitator; Base Sepolia only.

// CDP facilitator when its keys are set: settling through it lists the route in the Bazaar.
function facilitatorClient(): HTTPFacilitatorClient {
  const id = process.env.CDP_API_KEY_ID;
  const secret = process.env.CDP_API_KEY_SECRET;
  if (id && secret) return new HTTPFacilitatorClient(createFacilitatorConfig(id, secret));
  return new HTTPFacilitatorClient({ url: FACILITATOR_URL });
}
const NETWORK = "eip155:84532"; // Base Sepolia
const PRICE = "$0.001";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/**
 * Screens the payer before settlement. `paymentPayload.payload` is only
 * typed for the exact-EVM EIP-3009 flow this route accepts — any other shape
 * fails closed. Runs quickScan + toxicScore fresh every time; this path
 * never caches (see packages/screen policy: REFUSE/HOLD abort, PAY proceeds).
 */
async function screenPayer(paymentPayloadPayload: unknown): Promise<{ abort: true; reason: string; message?: string } | void> {
  const payload = paymentPayloadPayload as ExactEvmPayloadV2;
  if (!isEIP3009Payload(payload)) {
    return { abort: true, reason: "unsupported_payment_flow", message: "Mamoru San only screens the EIP-3009 exact-EVM authorization flow" };
  }

  const from = payload.authorization.from;
  const [quickScanResult, toxicScoreResult] = await Promise.all([quickScan(from), toxicScore(from)]);
  const result = screen({ address: { quickScan: quickScanResult, toxicScore: toxicScoreResult } });

  if (result.verdict !== "PAY") {
    return {
      abort: true,
      reason: result.verdict.toLowerCase(),
      message: result.reasons.map((r) => `${r.source}/${r.code}: ${r.detail}`).join("; ") || result.verdict,
    };
  }
}

export function createApp(): Hono {
  const payTo = requiredEnv("SELLER_PAY_TO");

  const x402Server = new x402ResourceServer(facilitatorClient());
  registerExactEvmScheme(x402Server, {});

  x402Server.onBeforeSettle(async (ctx) => screenPayer(ctx.paymentPayload.payload));

  const routes: RoutesConfig = {
    "GET /card/:pool": {
      accepts: {
        scheme: "exact",
        price: PRICE,
        network: NETWORK,
        payTo,
      },
      description: "Base mainnet Uniswap V3 pool facts, Intercepta token verdicts, and the questions Mamoru asks before entering.",
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({
          pathParams: { pool: "0xPoolAddress" },
          pathParamsSchema: {
            type: "object",
            properties: { pool: { type: "string", description: "Uniswap V3 pool address on Base mainnet" } },
            required: ["pool"],
          },
          output: {
            example: {
              pool: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
              chain: "base",
              block: "0",
              token0: { address: "0x...", symbol: "WETH", decimals: 18, source: "rpc:base-mainnet" },
              token1: { address: "0x...", symbol: "USDC", decimals: 6, source: "rpc:base-mainnet" },
              fee: 500,
              liquidity: "0",
              tick: 0,
              risk: {
                token0: { action: "info", reasons: [], source: "intercepta:token-risks" },
                token1: { action: "info", reasons: [], source: "intercepta:token-risks" },
              },
              questions: [{ gate: "Purga", question: "Should this pool or its tokens be excluded before any capital enters?" }],
              generatedAt: "2026-09-26T00:00:00.000Z",
            },
            schema: { type: "object" },
          },
        }),
      },
    },
  };

  const app = new Hono();

  // syncFacilitatorOnStart (default true): the facilitator's /supported
  // response is what tells the exact-EVM scheme how to build a valid 402 for
  // this network, so the first request that needs payment awaits it.
  app.use(paymentMiddleware(routes, x402Server));

  const rpcClient = createRpcClient();

  app.get("/card/:pool", async (c) => {
    const pool = c.req.param("pool");
    try {
      const card = await buildCard(rpcClient, pool);
      return c.json(card);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "failed to read pool" }, 502);
    }
  });

  return app;
}

if (import.meta.main) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 8787);
  console.error(JSON.stringify({ msg: "mamoru-san seller listening", port }));
  Bun.serve({ port, fetch: app.fetch });
}

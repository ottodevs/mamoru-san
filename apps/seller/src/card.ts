import { isScanFailure, type Scan, type TokenRisk } from "@mamoru-san/screen";
import { readPool, type RpcClient, type TokenFacts } from "./pool.ts";
import { cachedTokenRisks } from "./token-risk-cache.ts";

const TOKEN_RISK_CHAIN_ID = 8453; // Base mainnet, regardless of what network the card was paid on.
const INTERCEPTA_SOURCE = "intercepta:token-risks";

/** The questions Mamoru asks itself before entering a pool. Named only — no
 * Packaging thresholds, those stay in shadow until the engine ships them. */
const MAMORU_QUESTIONS = [
  { gate: "Purga", question: "Should this pool or its tokens be excluded before any capital enters?" },
  { gate: "Risk Monitor", question: "With capital inside, has anything changed that calls for leaving?" },
  { gate: "Execution Health Gate", question: "Can this specific operation execute cleanly right now?" },
  { gate: "ENY", question: "Is the expected net yield, after fees and drift, worth holding?" },
] as const;

export interface TokenCardFacts extends TokenFacts {
  readonly source: string;
}

export interface TokenRiskField {
  readonly action: TokenRisk["action"] | null;
  readonly reasons: readonly { code: string; detail: string }[];
  readonly source: string;
}

export interface Card {
  readonly pool: string;
  readonly chain: "base";
  readonly block: string;
  readonly token0: TokenCardFacts;
  readonly token1: TokenCardFacts;
  readonly fee: number;
  readonly liquidity: string;
  readonly tick: number;
  readonly risk: {
    readonly token0: TokenRiskField;
    readonly token1: TokenRiskField;
  };
  readonly questions: readonly { readonly gate: string; readonly question: string }[];
  readonly generatedAt: string;
}

function toRiskField(risk: Scan<TokenRisk>): TokenRiskField {
  if (isScanFailure(risk)) {
    return {
      action: null,
      reasons: [{ code: risk.kind, detail: risk.detail ?? "token-risks call failed" }],
      source: INTERCEPTA_SOURCE,
    };
  }
  return {
    action: risk.action,
    reasons: risk.reasons.map((reason) => ({ code: reason.code, detail: reason.detail })),
    source: INTERCEPTA_SOURCE,
  };
}

/** Builds the read-only pool card: on-chain facts (RPC) + Intercepta token
 * verdicts (cached 10 min) + the named Mamoru questions. */
export async function buildCard(client: RpcClient, poolAddress: string): Promise<Card> {
  const pool = await readPool(client, poolAddress);
  const [risk0, risk1] = await Promise.all([
    cachedTokenRisks(pool.token0.address, TOKEN_RISK_CHAIN_ID),
    cachedTokenRisks(pool.token1.address, TOKEN_RISK_CHAIN_ID),
  ]);

  return {
    pool: pool.pool,
    chain: pool.chain,
    block: pool.block.toString(),
    token0: pool.token0,
    token1: pool.token1,
    fee: pool.fee,
    liquidity: pool.liquidity,
    tick: pool.tick,
    risk: {
      token0: toRiskField(risk0),
      token1: toRiskField(risk1),
    },
    questions: MAMORU_QUESTIONS,
    generatedAt: new Date().toISOString(),
  };
}

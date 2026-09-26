import { createPublicClient, fallback, getAddress, http, type Address } from "viem";
import { base } from "viem/chains";

const poolAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { type: "uint160", name: "sqrtPriceX96" },
      { type: "int24", name: "tick" },
      { type: "uint16", name: "observationIndex" },
      { type: "uint16", name: "observationCardinality" },
      { type: "uint16", name: "observationCardinalityNext" },
      { type: "uint8", name: "feeProtocol" },
      { type: "bool", name: "unlocked" },
    ],
  },
] as const;

const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

// Public Base RPCs tried in order; BASE_RPC_URL, if set, goes first.
const PUBLIC_BASE_RPCS = [
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
];

export function baseRpcUrl(): string {
  return process.env.BASE_RPC_URL || "https://mainnet.base.org";
}

export function createRpcClient() {
  const custom = process.env.BASE_RPC_URL;
  const urls = custom ? [custom, ...PUBLIC_BASE_RPCS] : PUBLIC_BASE_RPCS;
  return createPublicClient({
    chain: base,
    // Multicall folds the pool and token reads into one eth_call.
    batch: { multicall: true },
    transport: fallback(urls.map((url) => http(url, { retryCount: 1 }))),
  });
}

export type RpcClient = ReturnType<typeof createRpcClient>;

export interface TokenFacts {
  readonly address: Address;
  readonly symbol: string;
  readonly decimals: number;
  readonly source: string;
}

export interface PoolFacts {
  readonly pool: Address;
  readonly chain: "base";
  readonly block: bigint;
  readonly token0: TokenFacts;
  readonly token1: TokenFacts;
  readonly fee: number;
  readonly liquidity: string;
  readonly tick: number;
}

/** Reads V3 pool facts (token0, token1, fee, liquidity, slot0.tick) plus the
 * block they were read at, straight from Base mainnet over RPC. No D1, no
 * engine, no signing. */
export async function readPool(client: RpcClient, poolAddress: string): Promise<PoolFacts> {
  const pool = getAddress(poolAddress);
  const rpcSource = "rpc:base-mainnet";

  const [token0, token1, fee, liquidity, slot0, block] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: "token0" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "token1" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "fee" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity" }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "slot0" }),
    client.getBlockNumber(),
  ]);

  const [symbol0, decimals0, symbol1, decimals1] = await Promise.all([
    client.readContract({ address: token0, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token0, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: token1, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token1, abi: erc20Abi, functionName: "decimals" }),
  ]);

  return {
    pool,
    chain: "base",
    block,
    token0: { address: token0, symbol: symbol0, decimals: decimals0, source: rpcSource },
    token1: { address: token1, symbol: symbol1, decimals: decimals1, source: rpcSource },
    fee,
    liquidity: liquidity.toString(),
    tick: slot0[1],
  };
}

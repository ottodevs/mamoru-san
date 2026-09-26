# mamoru-san

An x402 seller that answers one question for 0.001 USDC: is this Base pool and
these tokens a place to leave money? It reads a Uniswap V3 pool's on-chain
facts plus Intercepta's risk verdicts on both tokens, and names the questions
it asks itself before entering a pool (Purga, Risk Monitor, Execution Health
Gate, ENY) without publishing their thresholds. Because the service lives in
an open x402 directory, both sides screen their own money movement with
Intercepta before it happens: the buyer screens the seller's `payTo`, the
asset, and the payment message before signing; the seller screens the payer
before settling.

## Packages and apps

- `packages/screen` — pure verdict engine (`PAY` / `REFUSE` / `CAP` / `HOLD`)
  over normalized Intercepta results. No network calls.
- `packages/intercepta` — live Intercepta client (quick-scan, toxic-score,
  token-risks, scan-message). Fails closed with no API key.
- `apps/seller` — Hono x402 resource server, `GET /card/:pool`.
- `apps/buyer` — CLI that pays for and reads a card.

## Setup

```
bun install
cp .env.example .env   # fill in INTERCEPTA_API_KEY, SELLER_PAY_TO, BUYER_PRIVATE_KEY, BUYER_PAYTO_ALLOWLIST
```

## Run the seller

```
SELLER_PAY_TO=0xYourSepoliaPayoutAddress bun apps/seller/src/index.ts
```

Listens on `PORT` (default `8787`). `GET /card/<poolAddress>` is priced at
$0.001 USDC (scheme `exact`, network `eip155:84532`, facilitator
`https://x402.org/facilitator`) and declares the `bazaar` discovery extension.
An unpaid request returns HTTP 402 with the payment requirements; it does not
read the pool or call Intercepta until it is paid.

## Run the buyer

```
BUYER_PRIVATE_KEY=0xYourTestnetDustWalletKey \
BUYER_PAYTO_ALLOWLIST=0xYourSepoliaPayoutAddress \
bun apps/buyer/src/cli.ts http://localhost:8787/card/<poolAddress>
```

The buyer screens the seller's `payTo`, the payment asset, and the EIP-3009
message it is about to sign before it signs anything. It prints a verdict
table, then the card on success.

## Tests and typecheck

```
bun test packages
bun run typecheck
```

## Where Intercepta is called

| File | Function | Calls |
|---|---|---|
| `packages/intercepta/src/quick-scan.ts` | `quickScan(address)` | `GET /account/{address}/quick-scan` |
| `packages/intercepta/src/toxic-score.ts` | `toxicScore(address)` | `GET /account/{address}/toxic-score` |
| `packages/intercepta/src/token-risks.ts` | `tokenRisks(address, chainId=8453)` | `GET /token-intelligence/token/{address}/risks` |
| `packages/intercepta/src/scan-message.ts` | `scanMessage(typedData, chainId, opts?)` | `POST /analysis/signature` |
| `apps/seller/src/index.ts` | `screenPayer(...)`, wired via `x402ResourceServer.onBeforeSettle` | `quickScan` + `toxicScore` on the payer (`paymentPayload.payload.authorization.from`) |
| `apps/seller/src/card.ts` / `apps/seller/src/token-risk-cache.ts` | `buildCard(...)` -> `cachedTokenRisks(...)` | `tokenRisks` on `token0` and `token1`, cached 10 minutes |
| `apps/buyer/src/policy.ts` | `screenBeforePayment(...)`, wired via `x402Client.onBeforePaymentCreation` | `quickScan` + `toxicScore` on `payTo`, `tokenRisks` on the payment asset, `scanMessage` on the EIP-3009 authorization it is about to sign |

The pure decision logic that turns these results into a verdict lives in
`packages/screen/src/screen.ts` (and `screen-address.ts`, `screen-token.ts`,
`screen-message.ts`, `screen-spend.ts`). With `INTERCEPTA_API_KEY` unset,
every one of these calls fails closed before any network request: `HOLD`,
reason `no_api_key`.

## API feedback

To be written after the first live calls.

# mamoru-san

Mamoru San sells one answer to other agents for 0.001 USDC over x402: is this
Uniswap V3 pool on Base, and are its tokens, a place to leave money? The card
joins the pool's on-chain facts, Intercepta's verdict on both tokens, and the
four questions Mamoru asks before it enters a pool (without their thresholds).

Agents find sellers like this one in open x402 directories, so neither side
knows who is on the other end. A risk service that takes money from a
sanctioned wallet, or a risk buyer that pays a spoofed `payTo`, contradicts
itself. So both sides screen their own payment with Intercepta before it moves:

- the **buyer** screens the seller's `payTo`, the payment token and the
  authorization it is about to sign, in `onBeforePaymentCreation`;
- the **seller** screens the payer before settling, in `onBeforeSettle`.

The verdict decides what happens: `PAY`, `CAP` (lower the spend cap), `HOLD`
(stop for a person) or `REFUSE`. A timeout, a bad answer or a missing key is a
`HOLD`: silence never pays.

## Live run (2026-09-26)

Payment on Base Sepolia (`eip155:84532`), screening against Base and Ethereum
mainnet data, card for the Base USDC/WETH 0.05% pool
`0xd0b53D9277642d899DF5C87A3966A349A798F224`.

| Case | Seller `payTo` | Verdict | Signed | Settlement |
|---|---|---|---|---|
| Honest seller | fresh demo wallet `0xa4bE...b1F3` | `PAY` | yes | [`0x5028f79d...499f`](https://sepolia.basescan.org/tx/0x5028f79d7e06ae421b9291fc9ed4a0e1294bf6ef61afda7494cce5fea536499f) |
| Impostor seller | `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` (OFAC SDN, Ronin exploit) | `REFUSE` | no | none |

The impostor was refused on Intercepta's live traits `sanction_address`,
`known_scammer` and `blacklist` (toxic score 100), before any signature. On
the honest run the seller also screened the buyer's address live before it
settled.

## Verdict rules

| Intercepta says | Verdict |
|---|---|
| trait `sanction_address`, `known_scammer`, `blacklist`, `mixer_transfers` or `rug_pull` | `REFUSE` |
| token `action: block`, or message `riskGroup: High` with `WALLET_DRAINER` | `REFUSE` |
| message `riskGroup: High` without a drainer | `HOLD` |
| token `action: warn`, or message `riskGroup: Medium` | `CAP` |
| timeout, 403, unexpected body, no key, budget spent | `HOLD` |
| clean address, token `info`, message low | `PAY`, within the signer's cap and `payTo` allowlist |

The most severe result wins. The spend cap (0.005 USDC per call, 0.001 after a
`CAP`) and the `payTo` allowlist belong to whoever signs; no Intercepta
verdict raises them.

## Packages and apps

- `packages/screen`: pure verdict engine (`PAY` / `REFUSE` / `CAP` / `HOLD`)
  over normalized Intercepta results. No network calls.
- `packages/intercepta`: live Intercepta client (quick-scan, toxic-score,
  token-risks, scan-message). Fails closed with no API key.
- `apps/seller`: Hono x402 resource server, `GET /card/:pool`.
- `apps/buyer`: CLI that pays for and reads a card.

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

## Demo

```
bun run demo
```

Starts two seller processes: honest on `:8787` (`SELLER_PAY_TO` from `.env`)
and an "impostor" on `:8788` (`payTo` from `IMPOSTOR_PAY_TO`), then runs the
buyer's pre-signature screen against each, against a real Base mainnet
Uniswap V3 pool (default: the verified USDC/WETH 0.05% pool, see
`scripts/demo.ts` for how it was verified; override with `--pool <address>`).

- **Case 1 (honest)**: buyer screens the honest `payTo`, the payment asset,
  and the EIP-3009 message it is about to sign, then reports the verdict,
  whether it signed, and the settlement tx hash if the card was paid for.
- **Case 2 (impostor)**: same, against the impostor `payTo`. `IMPOSTOR_PAY_TO`
  is a known-risk mainnet address (the live run used a public OFAC SDN address, see above).
  If it is unset, this case is skipped with a clear message rather
  than inventing an address.

Each case prints its own verdict table, then a two-case summary at the end.
The seller child processes are killed on exit (normal completion, `Ctrl-C`,
or `SIGTERM`).

## Directory screening

```
bun apps/buyer/src/cli.ts --discover [--limit N]
```

Fetches the public CDP Bazaar discovery list (`GET
https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`, no API
key needed to read it), takes the first `N` resources (default 5), and
screens each *unique* `payTo` among them with `quickScan` + `toxicScore`
(address screening only, via `packages/screen`). Prints a
resource / payTo / verdict / reasons table. This mode never pays: it is
read-only directory screening, useful to see live verdicts on real x402
sellers' payout addresses without transacting with them.

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

Every call also consumes one unit of a process-wide request budget
(`INTERCEPTA_BUDGET`, default 50), checked *before* the API key. Once
exceeded, further calls in that process fail closed with `HOLD`, reason
`budget_exhausted`, without a network request either. See
`packages/intercepta/src/budget.ts`.

## API feedback

From our first live calls with the sandbox key (2026-09-26):

- Scan Message does not parse an x402 payment authorization. For an EIP-3009 `TransferWithAuthorization` on Base USDC it answers 201 with `domain` fields all `null`, `messageType: null`, no `addresses` and `riskGroup: "Low"`. That `Low` means "not understood", not "safe", so we record it as unclassified and let the `payTo` and token scans decide. Adding EIP-3009 (and Permit2 witness transfers) would make the signature check useful for x402.
- The first scan of an address never seen before took more than 4 s; repeat scans of the same address answered in about 130-150 ms. We raised our timeout to 10 s, and a timeout still holds the payment.
- Token risks for Base USDC with `chainId=8453` answered in about 470 ms. Toxic score and quick scan are separate calls with overlapping data, so screening one counterparty costs two requests.
- Good: one header, clear JSON, and `traits` / `detectors` with readable codes made the verdict easy to explain to a person.

# x402 research agent

`packages/app/scripts/x402-research-agent.ts` is an autonomous buyer for the
SMX x402 paywall (`GET /creators/{ticker}/audit-report`, 0.1 HBAR on Hedera
testnet). Given a budget, it decides what to buy, pays, and writes a memo without
human approval.

## What it does

1. **Discover.** `GET <base>/creators?sort=trending` with `Accept: application/json`.
2. **Decide.** One short chat call on the 0G Router (default model
   `qwen3.7-flash`, about $0.00000003 per input token) with each creator's
   summary. The model returns the tickers worth buying, at most as many as the
   budget affords. If the call fails the agent falls back to trending order and
   logs it.
3. **Fund a payer.** Creates a throwaway Hedera account from the operator key
   (`--fund`, default 0.5 HBAR).
4. **Buy.** For each ticker: `GET` the report, read the `402` terms, run the
   spend checks below, sign with `@x402/hedera`, retry with `X-PAYMENT`, read
   `X-PAYMENT-RESPONSE` for the transaction id.
5. **Memo.** One more Router call turns the reports into a one-paragraph
   investment memo. Report and creator text is passed as data, not instructions.

## Run

```bash
cd packages/app
node --env-file=../../.env scripts/x402-research-agent.ts [baseUrl] \
  [--budget 0.3] [--cap 0.1] [--fund 0.5] [--probe-cap 0.05] [--max-reports 3]
```

`baseUrl` defaults to `https://stakeme.magnificlabs.org`. Needs
`HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` (funds the payer) and
`ZG_ROUTER_API_KEY` in the env file. Nothing secret is printed.

## Spend controls

The agent enforces these before it signs anything. It doesn't trust the server.

| Control | Behavior |
| --- | --- |
| Hard budget | `--budget` HBAR in total (default 0.3). A price over the remaining budget is refused. |
| Per-call cap | `--cap` HBAR per report (default 0.1). A price over the cap is refused. |
| Asset allow-list | Only `0.0.0` (HBAR) on `hedera:testnet`. Any other asset or network in `accepts` is refused. |
| Second layer | The same cap and allow-list are set on the x402 client (`setSpendControls`). |
| Bounded payer | The throwaway payer holds only `--fund` HBAR. |
| Deliberate refusal | Before buying, the agent tries the first pick with `--probe-cap` (0.05 HBAR, below the 0.1 HBAR price) and logs `REFUSED`. No payment is signed. |

Every refusal is logged with its reason.

## Live run

## Public site run, 2026-11-07

The agent ran against `https://stakeme.magnificlabs.org`. Payer account `0.0.9185802`, payee (operator) `0.0.11340822`, 0.1 HBAR per report, budget 0.3 HBAR with a per-call cap.

| Step | Result |
| --- | --- |
| First attempt, cap 0.05 HBAR | Refused: price 0.1 HBAR is over the 0.05 HBAR per-call cap (spend control working). |
| `KART` report | [0.0.9185802@1794014248.030960679](https://hashscan.io/testnet/transaction/0.0.9185802@1794014248.030960679) |
| `MUSH` report | [0.0.9185802@1794014247.165009996](https://hashscan.io/testnet/transaction/0.0.9185802@1794014247.165009996) |
| `TIFFIN` report | [0.0.9185802@1794014252.176033328](https://hashscan.io/testnet/transaction/0.0.9185802@1794014252.176033328) |

With the cap at 0.1 HBAR the agent paid for three reports and spent 0.3 of 0.3 HBAR. The memo rates `KART` Buy, `MUSH` and `TIFFIN` Avoid.

### Earlier local run

The public site did not serve the route during an earlier 30-minute window
(00:18 to 00:48 IST on 2026-11-07). It now returns 402 unpaid at
`https://stakeme.magnificlabs.org/creators/MUSH/audit-report`, but the recorded
run below targets a local second instance (port 4031, its own PGlite data dir,
`CHAIN_RPC_URL` unset, three seeded creators `MUSH`, `LOFI`, `CHEF`). The payments are real Hedera testnet
transfers settled by the `x402.org` facilitator. The public-site rerun is recorded above.

Payer `0.0.11344435`, payee `0.0.11340822`, budget 0.3 HBAR, cap 0.1 HBAR:

| Step | Result |
| --- | --- |
| Over-cap probe on `CHEF` (cap 0.05 HBAR) | `REFUSED CHEF: price 0.1 HBAR is over the per-call cap 0.05 HBAR` |
| `CHEF` report | [0.0.9185802@1793992761.545261642](https://hashscan.io/testnet/transaction/0.0.9185802@1793992761.545261642) |
| `LOFI` report | [0.0.9185802@1793992766.013363358](https://hashscan.io/testnet/transaction/0.0.9185802@1793992766.013363358) |
| `MUSH` report | [0.0.9185802@1793992768.127890663](https://hashscan.io/testnet/transaction/0.0.9185802@1793992768.127890663) |

Total spent 0.3 of 0.3 HBAR (all three SUCCESS on the mirror node). A fourth
purchase would have been refused as over budget.

Known limit of this recorded run: it ran before a fix to the Router reply
parser (a slice bug dropped all but the last character of every model reply).
The pick step therefore used its trending-order fallback and the memo came
back empty. The payments, refusal and spend caps are unaffected. The parser is
fixed in the committed script and the Router prompt was re-checked, but the
paid flow was not run again.

Earlier single-payer run (hard-coded payer, before the agent):
[0.0.9185802@1793985016.835902874](https://hashscan.io/testnet/transaction/0.0.9185802@1793985016.835902874).

## Limits

- The server cannot enforce the agent's controls; they protect the payer.
- The payee is the SMX operator, so the loop demonstrates the mechanics and
  earns no external revenue.

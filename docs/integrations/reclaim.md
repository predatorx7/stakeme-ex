# Reclaim Protocol

Reclaim supplies the zkTLS proof of income. A creator logs in to the (mock)
bank in the Reclaim verification client; an attestor proves the
auth-bound `GET /mock-bank/api/transactions` response. The 0G agent verifies
the result and audits it.

Package: `@reclaimprotocol/client` 0.1.43 (Builder's client). It replaces
`@reclaimprotocol/js-sdk`.

## Environment

| Variable | Purpose |
| --- | --- |
| `RECLAIM_ORG_SECRET` | Org secret (`rorg_...`). Server only; never log it. |
| `RECLAIM_PROVIDER_ID` | Provider that proves the deposit. |
| `RECLAIM_ORG_ETH_PRIVATE_KEY` | Optional. Needed only when the org has result encryption on (it is off now); also binds the TEE nonce at session creation. |
| `RECLAIM_BASE_URL` | Optional Builder API override. |

Without the first two, `DEMO_MODE=1` accepts fixture proofs
(`{ demo: true, amount, context, id }`).

## Flow

1. `POST /creators/{ticker}/reclaim-sessions` calls
   `reclaim.sessions.create({ providers, context: { creatorId, ticker } })`.
   The route stores `id` and `orgId` in `smx.reclaim_sessions` and returns
   `{ sessionId, requestUrl, statusUrl }`. `requestUrl` is the
   `verificationUrl`.
2. The browser opens `requestUrl` and the creator proves the deposit.
3. Reclaim delivers the result to `POST /reclaim/callback` (port 4020 in dev;
   forward events locally with the MCP `proxy_callback_events` tool).
   The route loads the session by the envelope's `sessionId`, then calls
   `reclaim.results.receive(body, { reclaimSessionId, expectedAud })` with the
   values from our DB. Only `proofs[].data` is trusted.
4. `income_proofs.reclaim_session_id` links the proof; the session becomes
   `SUCCESS`. The 0G agent audits and SQL decides.
5. Failure events (`verification_rejected`, `verification_error`,
   `verification_cancelled`, `session_expired`) set the session status and
   `failure_reason` and answer `200`.
6. Polling fallback: `GET /reclaim/sessions/{sessionId}`. While pending it
   calls `GET /verifications/sessions/{id}` and records a failure the callback
   did not deliver. SSE stays the primary channel.

A `ResultVerificationError` answers `503` when `error.retryable` is true
(Builder's JWKS or recipe unreachable) so Reclaim redelivers, and `200`
otherwise.

## Mock bank (provider target)

| Path | Purpose |
| --- | --- |
| `GET /mock-bank/login` | Login form; any non-empty username and password. |
| `POST /mock-bank/login` | Sets the httpOnly `smx_bank_session` cookie, redirects to `/mock-bank`. |
| `GET /mock-bank` | Statement page; calls the API below with `fetch`. |
| `GET /mock-bank/api/transactions` | JSON statement for the chosen scenario (see below). `401` without the cookie. |

The provider proves `$.transactions[0].amount` and `$.transactions[0].date`,
so the first row is always the proven deposit. Pick a scenario to test the
auditor:

| Scenario | First row |
| --- | --- |
| Salary on time | $5,000.00 deposit dated today. |
| Low | $800.00 deposit, below the minimum income. |
| Big | $25,000.00 deposit. |
| Several deposits | A $5,000.00 row with the month's total, then the separate deposits. |
| None | $0.00, no income. |
| Late | $5,000.00 deposit dated 40 days ago. |

The auditor denies a deposit dated outside the reporting period (the last 30
days for monthly creators, 90 for quarterly) with "Deposit is outside the
reporting period". SMX checks this before calling 0G, so the audit log shows
engine `pre-check`. A proof with no date (demo fixtures) skips the check.

The amount parameter name the provider extracts may be `amount`,
`deposit_amount`, `depositAmount` or `income` (`extractIncomeAmount`). The
date parameter may be `date`, `deposit_date` or `depositDate`
(`extractDepositDate`).

## Gotchas

- Proofs older than 15 minutes are rejected (replay guard).
- Dedupe: `(creator_id, reclaim_proof_id)` is unique; a second submission
  returns `409`.
- The callback envelope (`sessionId`, `event`) is unauthenticated routing
  data. A failure event only moves a still-pending session.

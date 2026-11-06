# User flows

This page shows how creators and investors move through StakeMe Exchange
(SMX), and how the money, proofs, and states change along the way. Route and
SQL function names label the edges so you can find each step in the code. For
the full spec, see [product-spec.md](product-spec.md).

Actors in every diagram:

- **Creator**: the person who IPOs a share of their income.
- **Investor**: a wallet that funds the raise or trades the token.
- **SMX app**: the Express server and its worker.
- **0G auditor**: the agent on 0G Private Computer, through the 0G Router.

## Creator journey

A creator connects a wallet, proves they're a unique human, launches the IPO,
and then proves income each period. Each approved proof creates a dividend and
unlocks the next tranche.

```mermaid
flowchart TD
	wallet["Connect wallet: WalletConnect, browser extension, generated key, or imported key"]
	siwe["Sign in with SIWE"]
	world["World ID v4 check: POST /api/rp-signature, POST /api/world-id/check"]
	launch["Launch form: terms, stake, tranche preset or 'No tranches'"]
	ipo["POST /creators: launch_ipo()"]
	raise["Raise open: investors invest until target is met"]
	close["Raise closes: finish_raise() or POST /creators/{ticker}/close-raise"]
	t0["Tranche 0 released to creator, pool opens"]
	proof["Each period: prove income on /hub (see income proof)"]
	approved["Approved: audit_income_proof() creates dividend, releases next tranche"]
	pay["Pay dividend from own wallet: POST /dividends/{id}/payment"]
	term["Term ends: sweep_deadlines() returns stake, token is sell only"]

	wallet --> siwe --> world --> launch --> ipo --> raise --> close --> t0 --> proof --> approved --> pay
	pay -->|"Next period"| proof
	pay -->|"Term over"| term
```

Notes:

- The browser module `wallet.ts` offers WalletConnect, an injected extension
  (only when `window.ethereum` exists), a generated local key, or an imported
  key.
- `POST /api/world-id/check` rejects a used nullifier (409) or a blacklisted
  one (403) before `POST /creators` verifies the proof again on the server.
- `launch_ipo()` creates the tranches, all `LOCKED`, and queues the 0G Storage
  upload of the terms. It also queues the `createISA` and `initializeIPO`
  chain jobs.
- With the **No tranches** preset (`single`), 100% of the raise releases at
  close and no escrow milestones remain, so approved proofs only create
  dividends.

## Investor journey

An investor needs MockUSDC, then either invests in the primary raise (escrow)
or buys on the pool once the raise closes. Both paths are signed in the
investor's own wallet.

```mermaid
flowchart TD
	connect["Connect wallet and sign in"]
	faucet["Get MockUSDC: 'Get 1,000 test USDC' faucet or POST /portfolio/faucet"]
	browse["Browse GET / and GET /creators/{ticker}"]
	choice{"Raise still open?"}
	invest["approve + LiquidISA.invest, then POST /creators/{ticker}/investments: record_investment()"]
	buy["approve + pool swap, then POST /creators/{ticker}/trades"]
	audit["Read audit logs: GET /creators/{ticker}, proofs and 0G Storage refs"]
	hold["Hold token"]
	div["Receive dividends: Hedera payout, see portfolio"]
	sell["Sell on the pool: POST /creators/{ticker}/trades"]

	connect --> faucet --> browse --> choice
	choice -->|"Yes: funds go to escrow"| invest --> hold
	choice -->|"No: pool is open"| buy --> hold
	hold --> audit
	hold --> div
	hold --> sell
```

Notes:

- With an onchain pool, `Invest` and `Trade` take the `txHash` of the
  user-signed transaction. The server verifies the receipt and indexes it
  (`ingest_onchain_invest()`, `ingest_onchain_swap()`).
- Without a pool (simulated chain mode), the same routes run the SQL purchase
  and `amm_swap()`.
- After a default, `amm_swap()` rejects trades. After the term ends, the token
  is sell only.

## Income proof sequence

The creator proves a bank deposit with a Reclaim zkTLS proof. SMX verifies it,
the 0G auditor decides, and SQL applies the verdict. If 0G can't answer, the
proof stays `PENDING`.

```mermaid
sequenceDiagram
	autonumber
	actor Creator
	participant App as SMX app
	participant Reclaim
	participant Bank as Mock bank or real bank
	participant Attestor as Reclaim attestor
	participant ZeroG as 0G auditor
	participant DB as Postgres
	participant Storage as 0G Storage

	Creator->>App: POST /creators/{ticker}/reclaim-sessions
	App->>Reclaim: Create proof request
	App-->>Creator: Request link and QR
	Creator->>Reclaim: Open request
	Reclaim->>Bank: Log in, GET /mock-bank/api/transactions
	Bank-->>Reclaim: Deposits for the period
	Reclaim->>Attestor: Request attestation
	Attestor-->>Reclaim: Signed zkTLS proof
	Reclaim->>App: POST /reclaim/callback
	App->>App: runIncomeAudit(): verify proof and session
	App->>DB: submit_income_proof(): proof PENDING
	App->>App: Deposit-date pre-check (windowPreCheck)
	alt Date outside reporting period
		App->>DB: audit_income_proof(): denied, engine pre-check
	else Date in period
		App->>ZeroG: Audit income against L-ISA terms
		ZeroG-->>App: Verdict, request ID, log ref
		App->>DB: audit_income_proof(): approve or deny
	end
	DB-->>App: Dividend DUE, next tranche released, chain jobs queued
	DB->>Storage: storage_uploads outbox: audit log
	Storage-->>DB: Root hash replaces local ref
```

Notes:

- `ReclaimCallback` and `AuditMilestone` share `runIncomeAudit()`. The session,
  org, and creator come from the `reclaim_sessions` row, never from the body.
- A callback answers `201` when audited, `202` when 0G was unavailable (proof
  stays `PENDING`), and `200` for duplicates and rejected deliveries.
- The app uses the pre-check result before any 0G call, so the log says 0G
  didn't decide it.
- The rules engine runs only with `ZG_ALLOW_RULES_FALLBACK=1`, and the UI
  labels it. A model answer that breaks the rules is overridden in SQL.
- The mock bank offers six income scenarios. A real bank works the same way
  through its own Reclaim provider.
- In `DEMO_MODE=1`, the Hub can post a fixture proof to `POST /api/audit-milestone`
  instead.

## Creator state machine

`creators.status` is `DRAFT`, `LIVE`, `GRACE`, `DEFAULTED`, or `COMPLETED`.
The worker runs `sweep_deadlines()` on a timer, and approved proofs move the
state back.

```mermaid
stateDiagram-v2
	[*] --> DRAFT
	DRAFT --> LIVE: launch_ipo (World ID verified, stake deposited)
	LIVE --> LIVE: audit_income_proof approved
	LIVE --> GRACE: sweep_deadlines (proof overdue or dividend unpaid for a cadence)
	GRACE --> LIVE: audit_income_proof approved (late proof)
	GRACE --> DEFAULTED: sweep_deadlines (14-day grace expired)
	LIVE --> COMPLETED: sweep_deadlines (term end)
	DEFAULTED --> [*]
	COMPLETED --> [*]
```

Notes:

- Entering `GRACE` freezes the escrow (`freezeEscrow`, `ESCROW_FROZEN`). A late
  approved proof unfreezes it (`unfreezeEscrow`, `ESCROW_UNFROZEN`).
- Entering `COMPLETED` returns the stake (`reclaimStake`, `STAKE_RETURNED`).
  The token becomes sell only.

## Default and recovery path

A missed proof starts a 14-day grace period with a frozen escrow. A late
approved proof recovers the creator. Otherwise `liquidate_creator()` pays
holders and bans the creator's World ID.

```mermaid
flowchart TD
	miss["Proof overdue or dividend unpaid"]
	freeze["sweep_deadlines(): status GRACE, freezeEscrow"]
	grace{"Approved proof within 14 days?"}
	recover["audit_income_proof(): unfreezeEscrow, back to LIVE"]
	liq["sweep_deadlines() calls liquidate_creator()"]
	multi{"Locked tranches left?"}
	refund["Refund escrow pro rata to current holders"]
	slash["Slash stake pro rata to the same holders"]
	ban["Blacklist World ID nullifier"]
	done["Status DEFAULTED, executeLiquidation queued"]

	miss --> freeze --> grace
	grace -->|"Yes"| recover
	grace -->|"No"| liq --> multi
	multi -->|"Yes"| refund --> slash
	multi -->|"No: single tranche, no escrow left"| slash
	slash --> ban --> done
```

Notes:

- Holders are the current token holders (by `holdings`), not the original
  investors.
- A single-tranche creator has no escrow after the raise closes, so holders
  recover only the stake.
- While the escrow is frozen, tranche unlocks, `reclaimStake`, and pool
  trading stop. Claims and liquidation still work.

## Dividend payment

After an approved proof, the dividend is `DUE`. The creator funds their own
Hedera wallet, signs one multi-transfer, and SMX settles it. The operator pays
only in demo mode.

```mermaid
sequenceDiagram
	autonumber
	actor Creator
	participant Browser as hedera-pay.ts
	participant App as SMX app
	participant Hedera
	participant DB as Postgres

	Creator->>Browser: Click pay on /hub
	Browser->>App: POST /dividends/{id}/payment-request
	App-->>Browser: x402 requirements, one per holder, total HBAR
	Browser->>Hedera: Mirror node: read wallet balance
	opt Balance below total
		Browser-->>Creator: Fund wallet at the Hedera faucet
	end
	Creator->>Browser: Sign ONE HBAR multi-transfer (HashPack, Kabila, or local ECDSA key)
	Browser->>App: POST /dividends/{id}/payment (paymentPayload)
	App->>App: Rebuild requirements, check every transfer
	App->>Hedera: Add fee-payer signature, execute
	Hedera-->>App: Receipt, holders paid
	App->>DB: pay_dividend(): PAID, DIVIDEND_PAID
	Note over App,Hedera: Operator pays only when HEDERA_OPERATOR_PAYOUT=1 (demo)
```

Notes:

- HBAR amounts use the testnet rate `DIVIDEND_HBAR_PER_USDC`, 0.0001 HBAR per
  USDC by default.
- The worker (`streamPaidDividend`) handles `DIVIDEND_PAID` events. With live
  Hedera keys, it spends the operator's HBAR only when
  `HEDERA_OPERATOR_PAYOUT=1`, and it skips dividends the creator already
  settled.
- Without a signed payload, `PayDividend` only marks the dividend paid, and the
  worker's operator payout covers holders in demo mode.

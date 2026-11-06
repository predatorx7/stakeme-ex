/* @name ResolveViewerById */
-- Loads the signed-in viewer for `resolveViewer` (auth.ts): the Better Auth
-- user id resolved from the session cookie or bearer token.
SELECT
	u.id,
	u.email,
	u.name,
	smx.user_wallet(u.id) AS wallet_address
FROM smx.users u
WHERE u.id = :id!;


/* @name GetExchange */
-- Trending creators and latest oracle events. Route: GetExchange.
SELECT smx.exchange_json(:limit!::INTEGER) AS j;


/* @name ListCreators */
-- One page of the full creators list (`next` is the keyset of the last item,
-- null on the last page). Route: ListCreators.
SELECT smx.creators_page_json(
	:sort!, :status, :q, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name ListActivity */
-- One page of oracle events, newest first. Route: ListActivity.
SELECT smx.activity_page_json(
	:kind, :ticker, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name ListCreatorHolders */
-- One page of a creator's holders (404 for an unknown ticker).
-- Route: ListCreatorHolders.
SELECT smx.creator_holders_page_json(
	:ticker!, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name ListCreatorTrades */
-- One page of a creator's trades (404 for an unknown ticker).
-- Route: ListCreatorTrades.
SELECT smx.creator_trades_page_json(
	:ticker!, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name ListCreatorProofs */
-- One page of a creator's income proofs (404 for an unknown ticker).
-- Route: ListCreatorProofs.
SELECT smx.creator_proofs_page_json(
	:ticker!, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name ListCreatorUpdates */
-- One page of a creator's updates (404 for an unknown ticker).
-- Route: ListCreatorUpdates.
SELECT smx.creator_updates_page_json(
	:ticker!, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name CreateCreatorUpdate */
-- Owner-only post, 5 per rolling 24 hours; emits CREATOR_UPDATE.
-- Route: CreateCreatorUpdate.
SELECT smx.creator_update_json(u) AS j
FROM smx.post_creator_update(:viewer_id!, :ticker!, :body!, :link) AS u;


/* @name ListCreatorDividends */
-- One page of a creator's dividends (404 for an unknown ticker).
-- Route: ListCreatorDividends.
SELECT smx.creator_dividends_page_json(
	:ticker!, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name GetOracleEventsSince */
-- SSE replay: events after cursor `since`, oldest first, at most `limit`.
-- `creatorId` is optional. Route: StreamEvents.
SELECT smx.oracle_event_json(e) AS j
FROM smx.oracle_events_since(
	:since!::BIGINT, :creatorId::UUID, :limit!::INTEGER
) e;


/* @name GetCreatorPage */
-- Token page document; no row when the ticker is unknown. `wallet` is the
-- viewer's wallet (optional). Route: GetCreator.
SELECT smx.creator_page_json(:ticker!, :wallet::TEXT) AS j;


/* @name GetCreatorCandles */
-- OHLCV candles for one creator and chart interval (1H, 1D, 1W, ALL); raises
-- 404 for an unknown ticker. Route: GetCreatorCandles.
SELECT smx.creator_candles_json(
	smx.creator_id_by_ticker(:ticker!), :interval!
) AS j;


/* @name GetWatchlist */
-- The viewer's watchlist with each creator's summary. Route: GetWatchlist.
SELECT smx.watchlist_json(:viewer_id!) AS j;


/* @name PutWatchlistItem */
-- Adds a creator to the viewer's watchlist (idempotent). Route:
-- PutWatchlistItem.
SELECT smx.watchlist_add(:viewer_id!, :ticker!) AS j;


/* @name DeleteWatchlistItem */
-- Removes a creator from the viewer's watchlist (idempotent). Route:
-- DeleteWatchlistItem.
SELECT smx.watchlist_remove(:viewer_id!, :ticker!) AS removed;


/* @name GetCreatorHub */
-- The viewer's creator dashboard (empty object without a creator).
-- Route: GetCreatorHub.
SELECT smx.creator_hub_json(:viewer_id!) AS j;


/* @name GetLaunchState */
-- Whether the viewer already launched, for the launch form. Route: GetLaunch.
SELECT c.ticker
FROM smx.creators c
WHERE c.owner_user_id = :viewer_id!;


/* @name LaunchIpo */
-- Creates the L-ISA in one statement (creator, tranches, pool, tick, event,
-- chain jobs, 0G Storage upload) and returns the creator document. The terms
-- ref is `local:<sha256>` until the worker uploads. Route: LaunchIpo.
SELECT smx.creator_json(c) AS j
FROM smx.launch_ipo(
	:owner!,
	:wallet!,
	:ticker!,
	:display_name!,
	:headline!,
	:share_bps!,
	:term_months!,
	:target_raise!,
	:stake_amount!,
	:nullifier!,
	:terms_ref,
	:terms_hash,
	:chain_id,
	:terms_document::JSONB,
	:tranche_bps!::INTEGER[],
	:proof_cadence!::smx.proof_cadence,
	:social_links!::JSONB
) AS c;


/* @name Invest */
-- Primary-market purchase. Route: Invest.
SELECT smx.investment_json(i) AS j
FROM smx.record_investment(
	smx.creator_id_by_ticker(:ticker!), :wallet!, :usdc_amount!::NUMERIC
) AS i;


/* @name CloseRaise */
-- Creator ends the raise early; releases tranche 0 and opens trading.
SELECT c.id
FROM smx.close_raise(smx.creator_id_by_ticker(:ticker!), :viewer_id) AS c;


/* @name Trade */
-- AMM swap. Route: Trade.
SELECT smx.trade_json(t) AS j
FROM smx.amm_swap(
	smx.creator_id_by_ticker(:ticker!),
	:wallet!,
	:side!::smx.trade_side,
	:amount_in!::NUMERIC,
	:min_out!::NUMERIC
) AS t;


/* @name GetOwnedCreator */
-- Resolves a ticker to a creator the viewer owns (403 for someone else's,
-- no row for an unknown ticker). Route: CreateReclaimSession.
SELECT c.id, c.ticker
FROM smx.creators c
WHERE c.ticker = :ticker! AND smx.assert_creator_owner(c.id, :viewer_id!);


/* @name SubmitIncomeProof */
-- Stores a verified Reclaim proof as PENDING and returns what the auditor
-- needs. Routes: AuditMilestone, ReclaimCallback.
SELECT
	p.id AS "id!",
	p.period AS "period!",
	c.ticker AS "ticker!",
	c.share_bps AS "share_bps!",
	c.min_income::TEXT AS "min_income!",
	c.terms_hash,
	c.terms_ref,
	c.proof_cadence AS "proof_cadence!"
FROM smx.submit_income_proof(
	:creator_id!::UUID,
	:provider!,
	:reclaim_proof_id!,
	:amount!::NUMERIC,
	:raw::JSONB,
	NULL,
	:reclaim_session_id
) AS p
JOIN smx.creators c ON c.id = p.creator_id;


/* @name CreateReclaimSessionRow */
-- Records a verification session we created. Route: CreateReclaimSession.
INSERT INTO smx.reclaim_sessions(id, creator_id, org_id)
VALUES (:id!, :creator_id!::UUID, :org_id)
RETURNING id;


/* @name GetReclaimSession */
-- Session by id (callback lookup, no ownership check). Routes:
-- ReclaimCallback, AuditMilestone.
SELECT r.id AS "id!", r.creator_id AS "creator_id!", r.org_id, r.status::TEXT AS "status!"
FROM smx.reclaim_sessions r
WHERE r.id = :id!;


/* @name GetDemoProofQuota */
-- Whether the viewer owns the creator, and how many demo proofs it got in the
-- last hour (the per-creator cap protects the 0G credit). Route: AuditMilestone.
SELECT
	EXISTS(
		SELECT 1 FROM smx.creators c
		WHERE c.id = :creator_id! AND c.owner_user_id = :viewer_id!
	) AS "is_owner!",
	(
		SELECT count(*)::INT FROM smx.income_proofs p
		WHERE p.creator_id = :creator_id!
			AND p.provider = 'demo'
			AND p.created_at > now() - interval '1 hour'
	) AS "recent!";


/* @name GetOwnedReclaimSession */
-- Session JSON for its creator's owner (403 for someone else's, no row when
-- unknown). Route: GetReclaimSessionStatus.
SELECT smx.reclaim_session_json(r) AS j
FROM smx.reclaim_sessions r
WHERE r.id = :id! AND smx.assert_creator_owner(r.creator_id, :viewer_id!);


/* @name FinishReclaimSession */
-- Terminal failure (or poll result) of a session. Routes: ReclaimCallback,
-- GetReclaimSessionStatus.
SELECT smx.reclaim_session_json(r) AS j
FROM smx.finish_reclaim_session(
	:id!, :status!::smx.reclaim_session_status, :reason
) AS r;


/* @name GetDividendForPayment */
-- A due dividend the viewer may pay, with its holder splits. Routes:
-- CreateDividendPaymentRequest, PayDividend.
SELECT
	d.id AS "id!",
	d.creator_id AS "creator_id!",
	d.amount_due::TEXT AS "amount_due!",
	d.status::TEXT AS "status!",
	c.ticker AS "ticker!",
	smx.dividend_splits_json(d.id) AS "splits!"
FROM smx.dividends d
JOIN smx.creators c ON c.id = d.creator_id
WHERE d.id = :dividend_id! AND smx.assert_creator_owner(d.creator_id, :viewer_id!);


/* @name AuditIncomeProof */
-- Applies the rules engine to a pending proof. Routes: AuditMilestone,
-- ReclaimCallback.
SELECT smx.audit_result_json(p) AS j
FROM smx.audit_income_proof(
	:proof_id!, :verified_amount!::NUMERIC, :audit!::JSONB,
	:log_document::JSONB
) AS p;


/* @name MarkAuditUnavailable */
-- 0G could not audit: keep the proof PENDING with a retry status. Routes:
-- AuditMilestone, ReclaimCallback.
SELECT smx.audit_result_json(p) AS j
FROM smx.mark_audit_unavailable(:proof_id!::UUID, :message!) AS p;


/* @name TriggerDefault */
-- Demo: fast-forward and liquidate. Route: TriggerDefault.
SELECT smx.creator_json(c) AS j
FROM smx.demo_trigger_default(:ticker!) AS c;


/* @name PayDividend */
-- Creator pays a due dividend; `tx_hash` is the settled Hedera transaction
-- id when the browser paid through the x402 loop. Route: PayDividend.
SELECT smx.dividend_json(d) AS j
FROM smx.pay_dividend(:dividend_id!, :tx_hash, :viewer_id!) AS d;


/* @name GetPaidDividendReceipts */
-- Whether a dividend already has stream receipts (settled in the request).
-- Worker.
SELECT d.id, d.stream_receipts IS NOT NULL AS "settled!"
FROM smx.dividends d
WHERE d.id = :dividend_id!;


/* @name GetCreatorIdByTicker */
-- Resolves a ticker for the event stream filter. Route: StreamEvents.
SELECT c.id FROM smx.creators c WHERE c.ticker = :ticker!;


/* @name ListQueuedChainJobs */
-- The next onchain call per creator, oldest first. A creator's jobs run
-- strictly in order: only its earliest unsettled job is listed, and none while
-- an earlier one is SENT or FAILED, so a failed initializeIPO can't let its
-- invest calls revert. The worker re-lists after each pass. Worker.
SELECT n.id, n.fn, n.args, n.contract_address
FROM (
	SELECT DISTINCT ON (j.creator_id)
		j.id,
		j.seq,
		j.fn,
		j.args,
		j.status,
		c.contract_address::TEXT AS contract_address
	FROM smx.chain_jobs j
	JOIN smx.creators c ON c.id = j.creator_id
	WHERE j.status IN ('QUEUED', 'SENT', 'FAILED')
	ORDER BY j.creator_id, j.seq
) n
WHERE n.status = 'QUEUED'
ORDER BY n.seq
LIMIT :batch!::INTEGER;


/* @name ClaimChainJob */
-- Moves a QUEUED job to SENT; no row when another worker took it. Worker.
UPDATE smx.chain_jobs j
SET status = 'SENT'
FROM smx.creators c
WHERE j.id = :id! AND j.status = 'QUEUED' AND c.id = j.creator_id
RETURNING j.id, j.fn, j.args, c.contract_address::TEXT AS contract_address;


/* @name CompleteChainJob */
-- Settles a sent job and copies the result onto the domain row. Worker.
SELECT j.id, j.status
FROM smx.complete_chain_job(
	:id!, :status!::smx.chain_job_status, :tx_hash, :error, :isa, :token,
	:ats_token
) AS j;


/* @name SaveDividendReceipts */
-- Stores the per-holder stream receipts of a dividend. Worker.
UPDATE smx.dividends
SET stream_receipts = :receipts!::JSONB
WHERE id = :dividend_id!
RETURNING id;


/* @name SweepDeadlines */
-- LIVE to GRACE to DEFAULTED transitions. Worker (periodic).
SELECT s.creator_id, s.transition FROM smx.sweep_deadlines(now()) AS s;


/* @name GetContractForCreator */
-- Contract address of a creator, for dividend streaming. Worker.
SELECT c.contract_address::TEXT AS contract_address
FROM smx.creators c
WHERE c.id = :creator_id!;


/* @name SeedUpsertUser */
-- Demo seed only: a user with a primary wallet, idempotent by email.
WITH u AS (
	INSERT INTO smx.users(email, name, email_verified)
	VALUES (:email!, :name!, TRUE)
	ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
	RETURNING id
),
w AS (
	INSERT INTO smx.wallet_addresses(user_id, address, chain_id, is_primary)
	SELECT u.id, :wallet!, 296, TRUE FROM u
	ON CONFLICT (address, chain_id) DO NOTHING
)
SELECT u.id FROM u;


/* @name SeedSpreadHistory */
-- Demo seed only: spreads a creator's history over the last N days.
SELECT smx.demo_spread_history(
	smx.creator_id_by_ticker(:ticker!),
	make_interval(days => :days!::INTEGER)
);


/* @name SeedSetOverdue */
-- Demo seed only: puts a LIVE creator's proof deadline in the past.
UPDATE smx.creators
SET next_proof_due_at = now() - make_interval(hours => :hours!::INTEGER)
WHERE ticker = :ticker!
RETURNING id;


/* @name CheckLaunchable */
-- Fails fast (403 banned, 409 used) before the route spends a 0G Storage write.
-- Route: LaunchIpo.
SELECT smx.assert_nullifier_available(:nullifier!) AS ok;


/* @name RequeueFailedChainJobs */
-- Puts FAILED onchain calls back in the queue (optionally one creator's).
-- With :transient_only, only relay errors (HTTP failures, timeouts, 5xx) that
-- never reached the chain; reverts stay FAILED. A FAILED job blocks later
-- jobs of its creator until requeued. Worker sweep.
UPDATE smx.chain_jobs j
SET status = 'QUEUED', error = NULL, updated_at = now()
FROM smx.creators c
WHERE j.status = 'FAILED'
	AND c.id = j.creator_id
	AND (:ticker::TEXT IS NULL OR c.ticker = :ticker::TEXT)
	AND (
		NOT :transient_only!::BOOLEAN
		OR (
			j.error ~* '(HTTP request failed|took too long|timed? ?out|Status: 5[0-9][0-9]|ECONNRESET|fetch failed|FAIL_INVALID)'
			-- Back off so a struggling relay isn't hammered every poll.
			AND j.updated_at < now() - interval '30 seconds'
		)
	)
RETURNING j.id, j.fn, c.ticker;


/* @name ListDueStorageUploads */
-- Queued 0G Storage uploads whose backoff has passed, oldest first. Worker.
SELECT id FROM smx.storage_uploads
WHERE status = 'QUEUED' AND next_attempt_at <= now()
ORDER BY seq
LIMIT :batch!::INTEGER;


/* @name ClaimStorageUpload */
-- Leases one upload (counts the attempt). Returns no row when it isn't due;
-- an already-UPLOADED content hash comes back UPLOADED (don't upload). Worker.
SELECT s.id, s.creator_id, s.kind, s.document, s.content_hash, s.status,
	s.attempts
FROM smx.claim_storage_upload(:id!) AS s
WHERE s.id IS NOT NULL;


/* @name CompleteStorageUpload */
-- Settles an upload: UPLOADED swaps the ref in and emits STORAGE_CONFIRMED;
-- FAILED with :transient retries with backoff. Worker.
SELECT s.id, s.status
FROM smx.complete_storage_upload(
	:id!, :status!::smx.storage_upload_status, :ref, :error, :transient!::BOOLEAN
) AS s;


/* @name GetPortfolio */
-- A wallet's holdings, totals and dividends received, plus the user's own IPO.
-- Route: GetPortfolio.
SELECT smx.wallet_portfolio_json(:wallet, :user_id!) AS j;


/* @name ListWalletTransactions */
-- One page of a wallet's investments and trades, newest first.
-- Route: GetPortfolio.
SELECT smx.wallet_transactions_json(
	:wallet!, :after_key, :after_id, :limit!::INTEGER
) AS j;


/* @name GetCreatorChain */
-- Onchain addresses of a creator (no row for an unknown ticker).
-- Routes: Trade, Invest, GetCreatorChain.
SELECT c.id, c.status, c.contract_address, c.token_address, c.pool_address
FROM smx.creators c
WHERE c.ticker = :ticker!;


/* @name SetChainJobPool */
-- Stores the pool a settled createISA job deployed. Worker.
SELECT smx.set_chain_job_pool(:job_id!, :pool!) AS id;


/* @name IngestOnchainSwap */
-- Records a verified CreatorPool Swap event (base units). Route: Trade.
SELECT smx.trade_json(t) AS j
FROM smx.ingest_onchain_swap(
	:creator_id!, :trader!, :tx_hash!, :usdc_in!::NUMERIC, :token_in!::NUMERIC,
	:usdc_out!::NUMERIC, :token_out!::NUMERIC, :usdc_reserve!::NUMERIC,
	:token_reserve!::NUMERIC
) AS t;


/* @name IngestOnchainInvest */
-- Records a verified LiquidISA Invested event (base units). Route: Invest.
SELECT smx.investment_json(i) AS j
FROM smx.ingest_onchain_invest(
	:creator_id!, :investor!, :tx_hash!, :usdc!::NUMERIC, :shares!::NUMERIC,
	:raise_closed!::BOOLEAN, :pool_usdc::NUMERIC, :pool_tokens::NUMERIC
) AS i;

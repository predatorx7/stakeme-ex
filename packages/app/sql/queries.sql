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


/* @name GetCreatorPage */
-- Token page document; no row when the ticker is unknown. `wallet` is the
-- viewer's wallet (optional). Route: GetCreator.
SELECT smx.creator_page_json(:ticker!, :wallet::TEXT) AS j;


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
-- chain jobs) and returns the creator document. Route: LaunchIpo.
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
	:arkiv_entity_key,
	:terms_hash,
	:chain_id
) AS c;


/* @name Invest */
-- Primary-market purchase. Route: Invest.
SELECT smx.investment_json(i) AS j
FROM smx.record_investment(
	smx.creator_id_by_ticker(:ticker!), :wallet!, :usdc_amount!::NUMERIC
) AS i;


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
	c.terms_hash
FROM smx.submit_income_proof(
	:creator_id!::UUID,
	:provider!,
	:reclaim_proof_id!,
	:amount!::NUMERIC,
	:raw::JSONB
) AS p
JOIN smx.creators c ON c.id = p.creator_id;


/* @name AuditIncomeProof */
-- Applies the rules engine to a pending proof. Routes: AuditMilestone,
-- ReclaimCallback.
SELECT smx.audit_result_json(p) AS j
FROM smx.audit_income_proof(
	:proof_id!, :verified_amount!::NUMERIC, :audit!::JSONB
) AS p;


/* @name TriggerDefault */
-- Demo: fast-forward and liquidate. Route: TriggerDefault.
SELECT smx.creator_json(c) AS j
FROM smx.demo_trigger_default(:ticker!) AS c;


/* @name PayDividend */
-- Creator pays a due dividend. Route: PayDividend.
SELECT smx.dividend_json(d) AS j
FROM smx.pay_dividend(:dividend_id!, NULL, :viewer_id!) AS d;


/* @name GetCreatorIdByTicker */
-- Resolves a ticker for the event stream filter. Route: StreamEvents.
SELECT c.id FROM smx.creators c WHERE c.ticker = :ticker!;


/* @name ListQueuedChainJobs */
-- Oldest queued onchain calls with the contract they target. Worker.
SELECT
	j.id,
	j.fn,
	j.args,
	c.contract_address::TEXT AS contract_address
FROM smx.chain_jobs j
JOIN smx.creators c ON c.id = j.creator_id
WHERE j.status = 'QUEUED'
ORDER BY j.seq
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
	:id!, :status!::smx.chain_job_status, :tx_hash, :error, :isa, :token
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
-- Fails fast (403 banned, 409 used) before the route spends an Arkiv write.
-- Route: LaunchIpo.
SELECT smx.assert_nullifier_available(:nullifier!) AS ok;

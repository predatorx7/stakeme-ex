-- =============================================================
-- StakeMe Exchange (SMX) — base schema
--
-- Desired state of the `smx` schema. Invariants live here, not in
-- JavaScript. Domain features append their own sections below the
-- "domain" marker at the end of this file. After editing, run
-- `npm run migrate:plan` to generate the migration.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS smx;
SET search_path TO smx, public;

-- ─── extensions ────────────────────────────────────────────────
-- Installed into public so search_path-naive callers (pgtyped) resolve
-- citext / pg_trgm operators without schema qualification.
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "citext"   SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pg_trgm"  SCHEMA public;

-- ─── enums ────────────────────────────────────────────────────
-- Enum values are UPPER_SNAKE. Domain enums (creator_status, tranche_status,
-- ...) are added by the domain sections.
CREATE TYPE entity_status AS ENUM ('ACTIVE', 'ARCHIVED');

-- ─── value-type domains ──────────────────────────────────────
-- Each domain names a KIND of value so its rule lives in one place. A NULL
-- passes a domain CHECK, so nullable columns just leave off NOT NULL.

-- A bounded http(s) URL. http is allowed for local development.
CREATE DOMAIN safe_url AS TEXT
	CHECK (VALUE ~ '^https?://' AND length(VALUE) <= 2000);

CREATE DOMAIN email_address AS CITEXT
	CHECK (length(VALUE) BETWEEN 3 AND 320);

-- USDC amount: 6 decimals, never negative. NUMERIC, never float.
CREATE DOMAIN money_amount AS NUMERIC(18, 6)
	CHECK (VALUE >= 0);

-- Creator token amount: 18 decimals, never negative.
CREATE DOMAIN token_amount AS NUMERIC(38, 18)
	CHECK (VALUE >= 0);

-- EVM wallet address. CITEXT so checksummed and lowercase forms compare equal.
CREATE DOMAIN evm_address AS CITEXT
	CHECK (VALUE ~ '^0x[0-9a-fA-F]{40}$');

-- Transaction hash, lowercase hex.
CREATE DOMAIN tx_hash AS TEXT
	CHECK (VALUE ~ '^0x[0-9a-f]{64}$');

-- Social profile links. https only, and the host is pinned per network so a
-- look-alike host (`x.com.evil.test`, `x.com@evil.test`) can't pass: the host
-- must be followed by `/` or the end. Handles are bounded to what each network
-- allows. Case-insensitive on host and path.
CREATE DOMAIN social_x_url AS TEXT
	CHECK (
		VALUE ~* '^https://(www\.)?(x|twitter)\.com/[a-z0-9_]{1,15}/?$'
		AND length(VALUE) <= 200
	);
CREATE DOMAIN social_github_url AS TEXT
	CHECK (
		VALUE ~* '^https://(www\.)?github\.com/[a-z0-9]([a-z0-9-]{0,38})(/[a-z0-9._-]{1,100})?/?$'
		AND length(VALUE) <= 200
	);
CREATE DOMAIN social_linkedin_url AS TEXT
	CHECK (
		VALUE ~* '^https://([a-z]{2,3}\.)?linkedin\.com/(in|company)/[a-z0-9_%-]{3,100}/?$'
		AND length(VALUE) <= 200
	);
-- A personal site: any https host name (no userinfo, no IP-only or bare
-- label), optional port and path, no whitespace or markup characters.
CREATE DOMAIN social_website_url AS TEXT
	CHECK (
		VALUE ~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?(/[^\s<>"''`\\]*)?$'
		AND length(VALUE) <= 300
	);
-- An optional link on a creator update: https only, any host.
CREATE DOMAIN https_url AS TEXT
	CHECK (
		VALUE ~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?(/[^\s<>"''`\\]*)?$'
		AND length(VALUE) <= 300
	);

-- ─── audit-column conventions ─────────────────────────────────
-- Every mutable table carries:
--   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   created_by UUID,                  -- smx.users.id, NULL for system rows
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--   updated_by UUID
-- and a `BEFORE UPDATE` trigger calling `touch_updated_at()` so
-- `updated_at` is always current. Primary keys are
-- `UUID DEFAULT gen_random_uuid()`.

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;

-- ─── coded errors ─────────────────────────────────────────────
-- Application errors raised in SQL carry their HTTP status in the SQLSTATE
-- (`H0<status>`, for example `H0409`). `utils/map-error.ts` turns these into
-- Boom errors with the right status, so routes need no per-error lookup.

-- Raise a coded error unconditionally.
CREATE OR REPLACE FUNCTION raise_error(p_status INT, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
BEGIN
	RAISE EXCEPTION '%', p_message
		USING ERRCODE = 'H0' || lpad(p_status::TEXT, 3, '0');
END;
$$;

-- Assert a condition inside a query: `WHERE smx.assert_that(x > 0, 400, '...')`.
-- Returns TRUE when the condition holds, else raises the coded error. Not
-- inlinable on purpose: the raise must not be optimised away.
CREATE OR REPLACE FUNCTION assert_that(
	p_ok BOOLEAN, p_status INT, p_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = smx, public
AS $$
BEGIN
	IF p_ok IS NOT TRUE THEN
		PERFORM raise_error(p_status, p_message);
	END IF;
	RETURN TRUE;
END;
$$;

-- ─── users ────────────────────────────────────────────────────
-- This IS Better Auth's user model (user.modelName='users', snake_case field
-- maps in better-auth.ts). Better Auth writes id/email/email_verified/name/
-- image; the SIWE plugin gives every wallet user a placeholder email. It never
-- sets the audit columns, so they stay app-managed.
CREATE TABLE users(
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email          email_address NOT NULL UNIQUE,
	email_verified BOOLEAN NOT NULL DEFAULT FALSE,
	name           TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
	image          TEXT CHECK (image IS NULL OR length(image) <= 2000),
	created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_by     UUID,
	updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_by     UUID
);

CREATE TRIGGER users_touch_updated_at
	BEFORE UPDATE ON users
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── Better Auth ──────────────────────────────────────────────
-- Auxiliary tables Better Auth owns. They are vendored here so the schema
-- rebuild and the test harness recreate them; Better Auth never migrates.
-- `user_id` FKs are UUID (advanced.database.generateId = 'uuid'). Names are
-- mapped to snake_case through the `modelName`/`fields` config in
-- better-auth.ts. Regenerate after changing plugins:
--   cd packages/app && npx @better-auth/cli generate \
--     --config src/better-auth.cli.ts

CREATE TABLE session(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	expires_at TIMESTAMPTZ NOT NULL,
	token      TEXT NOT NULL UNIQUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL,
	ip_address TEXT,
	user_agent TEXT,
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX session_user_id_idx ON session(user_id);

-- Linked sign-in methods. SIWE writes provider_id = 'siwe' and
-- account_id = '<address>:<chainId>'.
CREATE TABLE account(
	id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	account_id               TEXT NOT NULL,
	provider_id              TEXT NOT NULL,
	user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	access_token             TEXT,
	refresh_token            TEXT,
	id_token                 TEXT,
	access_token_expires_at  TIMESTAMPTZ,
	refresh_token_expires_at TIMESTAMPTZ,
	scope                    TEXT,
	password                 TEXT,
	created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at               TIMESTAMPTZ NOT NULL
);
CREATE INDEX account_user_id_idx ON account(user_id);

-- Short-lived values, for example SIWE nonces (identifier 'siwe:<nonce>').
CREATE TABLE verification(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	identifier TEXT NOT NULL,
	value      TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON verification(identifier);

-- Wallets linked to a user (Better Auth SIWE plugin `walletAddress` model).
-- The same address may be linked on several chains, but one address maps to
-- one user.
CREATE TABLE wallet_addresses(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	address    evm_address NOT NULL,
	chain_id   INTEGER NOT NULL CHECK (chain_id > 0),
	is_primary BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (address, chain_id)
);
CREATE INDEX wallet_addresses_user_id_idx ON wallet_addresses(user_id);

-- ─── viewer helpers ───────────────────────────────────────────

-- The viewer's primary wallet, or NULL when none is linked. Inlinable SQL
-- function, so it has no SET clause and qualifies its tables.
CREATE OR REPLACE FUNCTION user_wallet(p_user UUID)
RETURNS evm_address
LANGUAGE sql STABLE
AS $$
	SELECT w.address
	FROM smx.wallet_addresses w
	WHERE w.user_id = p_user
	ORDER BY w.is_primary DESC, w.created_at
	LIMIT 1
$$;

-- ─── domain ───────────────────────────────────────────────────
-- SMX domain: creators (one liquid income-share agreement each), the primary
-- and AMM markets, income proofs, dividends, the oracle event feed and the
-- onchain-call outbox. Business rules live in the functions below.

-- ─── domain enums ─────────────────────────────────────────────
CREATE TYPE creator_status AS ENUM (
	'DRAFT', 'LIVE', 'GRACE', 'DEFAULTED', 'COMPLETED'
);
CREATE TYPE tranche_status AS ENUM ('LOCKED', 'RELEASED', 'REFUNDED');
CREATE TYPE trade_side AS ENUM ('BUY', 'SELL');
CREATE TYPE proof_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE dividend_status AS ENUM ('DUE', 'PAID');
CREATE TYPE oracle_event_kind AS ENUM (
	'IPO', 'INVESTED', 'PROOF_VERIFIED', 'PROOF_REJECTED', 'TRANCHE_RELEASED',
	'DIVIDEND_PAID', 'GRACE_STARTED', 'DEFAULTED', 'TRADE',
	'ESCROW_FROZEN', 'ESCROW_UNFROZEN', 'STORAGE_CONFIRMED', 'CREATOR_UPDATE',
	'STAKE_RETURNED'
);
-- How often a creator must prove income. One approved proof releases the next
-- tranche and pushes the deadline out by this interval.
CREATE TYPE proof_cadence AS ENUM ('MONTHLY', 'QUARTERLY');
CREATE TYPE storage_upload_kind AS ENUM ('LISA_TERMS', 'AUDIT_LOG');
CREATE TYPE storage_upload_status AS ENUM (
	'QUEUED', 'UPLOADED', 'FAILED', 'SKIPPED'
);
CREATE TYPE chain_job_status AS ENUM (
	'QUEUED', 'SENT', 'CONFIRMED', 'FAILED', 'SIMULATED'
);
-- Where money left the system for a holder: a dividend share, a refund of
-- locked escrow, or a slice of the slashed creator stake.
CREATE TYPE payout_kind AS ENUM ('DIVIDEND', 'REFUND', 'SLASH');
-- Lifecycle of a Reclaim verification session (mirrors the Builder status).
CREATE TYPE reclaim_session_status AS ENUM (
	'PENDING', 'SUCCESS', 'REJECTED', 'ERROR', 'CANCELLED', 'EXPIRED'
);

-- ─── creators ─────────────────────────────────────────────────
-- One row per L-ISA. A human (World ID nullifier) can launch exactly one, and
-- a user owns at most one, so the hub can resolve "the viewer's creator".
CREATE TABLE creators(
	id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_user_id      UUID NOT NULL UNIQUE REFERENCES users(id),
	owner_wallet       evm_address NOT NULL,
	ticker             TEXT NOT NULL UNIQUE CHECK (ticker ~ '^[A-Z]{3,6}$'),
	display_name       TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
	headline           TEXT NOT NULL DEFAULT '' CHECK (length(headline) <= 280),
	share_bps          INTEGER NOT NULL DEFAULT 500
		CHECK (share_bps BETWEEN 1 AND 5000),
	term_months        INTEGER NOT NULL DEFAULT 60
		CHECK (term_months BETWEEN 1 AND 120),
	target_raise       money_amount NOT NULL CHECK (target_raise > 0),
	-- Creator collateral. Slashed to holders on default.
	stake_amount       money_amount NOT NULL CHECK (stake_amount > 0),
	-- Monthly income below this is rejected by the audit rules engine.
	min_income         money_amount NOT NULL DEFAULT 1000,
	-- Denormalised sum of investments, so the raise cap needs no aggregate.
	raised_amount      money_amount NOT NULL DEFAULT 0,
	status             creator_status NOT NULL DEFAULT 'DRAFT',
	-- Decimal (or 0x-hex) World ID nullifier. 256-bit, so TEXT, not a number.
	world_id_nullifier TEXT NOT NULL UNIQUE CHECK (
		world_id_nullifier ~ '^([0-9]{1,78}|0x[0-9a-fA-F]{1,64})$'
	),
	-- 0G Storage root hash (or `local:<sha256>`) of the L-ISA legal terms.
	terms_ref          TEXT CHECK (length(terms_ref) <= 200),
	terms_hash         TEXT CHECK (length(terms_hash) <= 200),
	contract_address   evm_address,
	token_address      evm_address,
	-- Hedera Asset Tokenization Studio equity token (EVM address).
	ats_token_address  evm_address,
	chain_id           INTEGER CHECK (chain_id > 0),
	next_proof_due_at  TIMESTAMPTZ,
	grace_until        TIMESTAMPTZ,
	ipo_at             TIMESTAMPTZ,
	-- When the raise closed (filled, or closed by the creator). Tranche 0
	-- releases, the pool opens for trading and the term clock starts here.
	raise_closed_at    TIMESTAMPTZ,
	-- Chosen at launch; sets the deadline step (see `proof_cadence_interval`).
	proof_cadence      proof_cadence NOT NULL DEFAULT 'MONTHLY',
	-- Optional public profile links (at most these four).
	x_url              social_x_url,
	github_url         social_github_url,
	linkedin_url       social_linkedin_url,
	website_url        social_website_url,
	created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_by         UUID,
	updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_by         UUID,
	CHECK (raised_amount <= target_raise)
);
CREATE INDEX creators_status_due_idx ON creators(status, next_proof_due_at);
-- /creators search (ILIKE) and the newest sort.
CREATE INDEX creators_ticker_trgm_idx ON creators USING gin (ticker gin_trgm_ops);
CREATE INDEX creators_name_trgm_idx
	ON creators USING gin (display_name gin_trgm_ops);
CREATE INDEX creators_created_idx ON creators(created_at DESC, id DESC);
CREATE TRIGGER creators_touch_updated_at
	BEFORE UPDATE ON creators
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── tranches ─────────────────────────────────────────────────
-- Escrow schedule (default 20/40/40). Tranche 0 releases when the raise closes
-- (`finish_raise`); each approved income proof releases the next locked one.
CREATE TABLE tranches(
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id  UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	idx         INTEGER NOT NULL CHECK (idx >= 0),
	amount      money_amount NOT NULL,
	status      tranche_status NOT NULL DEFAULT 'LOCKED',
	released_at TIMESTAMPTZ,
	tx_hash     tx_hash,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE (creator_id, idx)
);
CREATE TRIGGER tranches_touch_updated_at
	BEFORE UPDATE ON tranches
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── creator_updates ──────────────────────────────────────────
-- Short plain-text posts by a creator to their holders. Each insert also emits
-- a CREATOR_UPDATE oracle event (see `post_creator_update`).
CREATE TABLE creator_updates(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	body       TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
	link       https_url,
	created_by UUID,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Keyset pages (newest first) and the daily post count.
CREATE INDEX creator_updates_creator_idx
	ON creator_updates(creator_id, created_at DESC, id DESC);

-- ─── investments ──────────────────────────────────────────────
-- Primary-market purchases at the fixed IPO price (1 USDC = 1 token).
CREATE TABLE investments(
	id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id   UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	wallet       evm_address NOT NULL,
	usdc_amount  money_amount NOT NULL CHECK (usdc_amount > 0),
	token_amount token_amount NOT NULL CHECK (token_amount > 0),
	tx_hash      tx_hash,
	created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX investments_creator_idx ON investments(creator_id, created_at);

-- ─── holdings ─────────────────────────────────────────────────
-- Derived token balances; maintained by record_investment and amm_swap.
CREATE TABLE holdings(
	creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	wallet     evm_address NOT NULL,
	balance    token_amount NOT NULL DEFAULT 0,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (creator_id, wallet)
);
-- /creators/{ticker}/holders keyset order.
CREATE INDEX holdings_creator_balance_idx
	ON holdings(creator_id, balance DESC, wallet) WHERE balance > 0;

-- ─── pools ────────────────────────────────────────────────────
-- Constant-product AMM, one per creator. The pool is an explicit token holder:
-- `token_reserve` is the pool's balance of the creator token, seeded at IPO
-- (price 1.0) so a first buyer has a counterparty. Buys move tokens from the
-- reserve to the buyer, sells move them back, so always
-- `sum(holdings) + token_reserve = raised_amount + seed` (see
-- `token_supply_check`). The pool is not in `holdings`, so dividends, refunds
-- and slashes (which split by holdings) exclude it, as the contract does.
CREATE TABLE pools(
	creator_id    UUID PRIMARY KEY REFERENCES creators(id) ON DELETE CASCADE,
	usdc_reserve  money_amount NOT NULL CHECK (usdc_reserve > 0),
	token_reserve token_amount NOT NULL CHECK (token_reserve > 0),
	updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── trades ───────────────────────────────────────────────────
CREATE TABLE trades(
	id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id   UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	wallet       evm_address NOT NULL,
	side         trade_side NOT NULL,
	usdc_amount  money_amount NOT NULL,
	token_amount token_amount NOT NULL,
	-- Effective execution price in USDC per token (fee included).
	price        NUMERIC(38, 18) NOT NULL,
	-- 0.3% fee, in the input asset (USDC for BUY, tokens for SELL).
	fee          NUMERIC(38, 18) NOT NULL,
	tx_hash      tx_hash,
	created_at   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX trades_creator_idx ON trades(creator_id, created_at DESC);

-- ─── price_ticks ──────────────────────────────────────────────
-- Chart history: one tick per oracle event (trades are oracle events too).
CREATE TABLE price_ticks(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	at         TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
	price      NUMERIC(38, 18) NOT NULL CHECK (price >= 0)
);
CREATE INDEX price_ticks_creator_at_idx ON price_ticks(creator_id, at DESC);

-- ─── income_proofs ────────────────────────────────────────────
-- A Reclaim zkTLS proof of income for one period (month index since IPO).
-- PENDING until the audit runs; the audit decides APPROVED or REJECTED.
CREATE TABLE income_proofs(
	id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id       UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	period           INTEGER NOT NULL CHECK (period >= 0),
	provider         TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 200),
	reclaim_proof_id TEXT NOT NULL CHECK (length(reclaim_proof_id) BETWEEN 1 AND 500),
	-- Reclaim verification session that produced the proof (NULL for demo).
	reclaim_session_id TEXT CHECK (length(reclaim_session_id) <= 200),
	verified_amount  money_amount NOT NULL,
	status           proof_status NOT NULL DEFAULT 'PENDING',
	-- Auditor output (0G agent or the rules engine).
	audit            JSONB,
	-- 0G storage root of the audit log.
	audit_log_ref    TEXT CHECK (length(audit_log_ref) <= 500),
	raw              JSONB,
	created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
	-- Replaying the same Reclaim proof must not create a second row.
	UNIQUE (creator_id, reclaim_proof_id)
);
-- Backstop for "one approved proof per period" under concurrency.
CREATE INDEX income_proofs_creator_idx
	ON income_proofs(creator_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX income_proofs_one_approved_per_period
	ON income_proofs(creator_id, period) WHERE status = 'APPROVED';
CREATE TRIGGER income_proofs_touch_updated_at
	BEFORE UPDATE ON income_proofs
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── reclaim_sessions ─────────────────────────────────────────
-- One row per verification session we created. The callback and the status
-- poll move it out of PENDING exactly once; `proof_id` is set on success.
CREATE TABLE reclaim_sessions(
	id             TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
	creator_id     UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	-- Reclaim organization the result must be addressed to (`aud`).
	org_id         TEXT CHECK (length(org_id) <= 200),
	status         reclaim_session_status NOT NULL DEFAULT 'PENDING',
	failure_reason TEXT CHECK (length(failure_reason) <= 500),
	proof_id       UUID REFERENCES income_proofs(id),
	created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reclaim_sessions_creator_idx
	ON reclaim_sessions(creator_id, created_at DESC);
CREATE TRIGGER reclaim_sessions_touch_updated_at
	BEFORE UPDATE ON reclaim_sessions
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── dividends ────────────────────────────────────────────────
-- Created on proof approval: verified income x share_bps. The creator pays it.
CREATE TABLE dividends(
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id      UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	proof_id        UUID NOT NULL UNIQUE REFERENCES income_proofs(id),
	amount_due      money_amount NOT NULL,
	status          dividend_status NOT NULL DEFAULT 'DUE',
	paid_tx_hash    tx_hash,
	paid_at         TIMESTAMPTZ,
	-- Receipts of the per-holder stream (Hedera x402 or simulated).
	stream_receipts JSONB,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dividends_creator_idx ON dividends(creator_id, created_at DESC);
CREATE TRIGGER dividends_touch_updated_at
	BEFORE UPDATE ON dividends
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── payouts ──────────────────────────────────────────────────
-- Per-holder money movements (dividend shares, escrow refunds, stake slashes).
CREATE TABLE payouts(
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id  UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	dividend_id UUID REFERENCES dividends(id),
	wallet      evm_address NOT NULL,
	kind        payout_kind NOT NULL,
	amount      money_amount NOT NULL CHECK (amount > 0),
	created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payouts_creator_idx ON payouts(creator_id, kind);
CREATE INDEX payouts_wallet_idx ON payouts(wallet);

-- ─── oracle_events ────────────────────────────────────────────
-- The live feed. `payload` always carries `ticker` so the SSE stream can
-- render a row without a join.
CREATE TABLE oracle_events(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Monotonic cursor for SSE replay (`Last-Event-ID`). Assigned at insert, so
	-- it can skip a value on rollback but never goes backwards.
	seq        BIGINT GENERATED ALWAYS AS IDENTITY,
	creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	kind       oracle_event_kind NOT NULL,
	payload    JSONB NOT NULL DEFAULT '{}',
	created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX oracle_events_seq_idx ON oracle_events(seq);
CREATE INDEX oracle_events_created_idx ON oracle_events(created_at DESC, id);
CREATE INDEX oracle_events_creator_idx
	ON oracle_events(creator_id, created_at DESC);
CREATE INDEX oracle_events_creator_seq_idx ON oracle_events(creator_id, seq DESC);

-- Publish every new event to pgmb (topic `smx.oracle_events.insert`) from a
-- trigger, inside the writing transaction: the SSE stream and the dividend
-- streamer then see an event if and only if its state change committed, and
-- no function has to remember to publish.
SELECT pgmb.push_table_mutations(
	'smx.oracle_events'::regclass,
	update := FALSE,
	delete := FALSE
);

-- ─── chain_jobs ───────────────────────────────────────────────
-- Outbox of onchain calls. Mutations commit final DB state and enqueue a job;
-- the worker sends it later (optimistic UI) and flips the status.
CREATE TABLE chain_jobs(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Stable processing order; created_at ties inside one transaction.
	seq        BIGINT GENERATED ALWAYS AS IDENTITY,
	creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	fn         TEXT NOT NULL CHECK (fn IN (
		'createISA', 'initializeIPO', 'invest', 'unlockNextTranche',
		'distributeDividend', 'executeLiquidation', 'freezeEscrow',
		'unfreezeEscrow', 'closeRaise', 'reclaimStake'
	)),
	args       JSONB NOT NULL DEFAULT '{}',
	status     chain_job_status NOT NULL DEFAULT 'QUEUED',
	tx_hash    tx_hash,
	error      TEXT CHECK (length(error) <= 2000),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chain_jobs_queue_idx ON chain_jobs(seq) WHERE status = 'QUEUED';
CREATE INDEX chain_jobs_creator_idx ON chain_jobs(creator_id, seq DESC);
CREATE TRIGGER chain_jobs_touch_updated_at
	BEFORE UPDATE ON chain_jobs
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Wake the worker the moment a job is queued (`smx.chain_jobs.insert`) and
-- tell browsers when it settles (`smx.chain_jobs.update`, streamed by SSE) so
-- the "pending" badge clears without polling.
SELECT pgmb.push_table_mutations(
	'smx.chain_jobs'::regclass,
	delete := FALSE
);

-- ─── storage_uploads ──────────────────────────────────────────
-- Outbox of 0G Storage uploads. IPOs and audits commit with a local ref
-- (`local:<sha256>`) and queue the document here; the worker uploads it (about
-- 30 s) and `complete_storage_upload` swaps in the 0G root hash. `owner_id` is
-- the creator (LISA_TERMS) or the income proof (AUDIT_LOG). `document` is the
-- exact object the app canonicalizes and hashes; `content_hash` is its sha256.
CREATE TABLE storage_uploads(
	id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	seq             BIGINT GENERATED ALWAYS AS IDENTITY,
	creator_id      UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	kind            storage_upload_kind NOT NULL,
	owner_id        UUID NOT NULL,
	document        JSONB NOT NULL,
	content_hash    TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
	status          storage_upload_status NOT NULL DEFAULT 'QUEUED',
	ref             TEXT CHECK (length(ref) <= 200),
	error           TEXT CHECK (length(error) <= 2000),
	attempts        INTEGER NOT NULL DEFAULT 0,
	-- Backoff after a transient failure, and the lease while one upload runs.
	next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX storage_uploads_queue_idx
	ON storage_uploads(seq) WHERE status = 'QUEUED';
CREATE INDEX storage_uploads_owner_idx
	ON storage_uploads(kind, owner_id, seq DESC);
CREATE INDEX storage_uploads_hash_idx
	ON storage_uploads(content_hash) WHERE status = 'UPLOADED';
CREATE TRIGGER storage_uploads_touch_updated_at
	BEFORE UPDATE ON storage_uploads
	FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Wake the worker the moment an upload is queued (`smx.storage_uploads.insert`).
SELECT pgmb.push_table_mutations(
	'smx.storage_uploads'::regclass,
	update := FALSE,
	delete := FALSE
);

-- ─── blacklisted_nullifiers ───────────────────────────────────
-- World IDs banned after a default: the same human can't IPO again.
CREATE TABLE blacklisted_nullifiers(
	nullifier  TEXT PRIMARY KEY,
	creator_id UUID REFERENCES creators(id),
	reason     TEXT NOT NULL DEFAULT 'DEFAULTED',
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── assertions ───────────────────────────────────────────────

-- Used in `WHERE` clauses; raises 403 when the nullifier is banned and 409
-- when it already launched.
CREATE OR REPLACE FUNCTION assert_nullifier_available(p_nullifier TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = smx, public
AS $$
BEGIN
	PERFORM assert_that(
		NOT EXISTS (
			SELECT 1 FROM blacklisted_nullifiers b WHERE b.nullifier = p_nullifier
		),
		403, 'This World ID is blacklisted after a default'
	);
	PERFORM assert_that(
		NOT EXISTS (
			SELECT 1 FROM creators c WHERE c.world_id_nullifier = p_nullifier
		),
		409, 'This World ID has already launched an IPO'
	);
	RETURN TRUE;
END;
$$;

-- Resolves a ticker to a creator id or raises 404.
CREATE OR REPLACE FUNCTION creator_id_by_ticker(p_ticker TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = smx, public
AS $$
DECLARE
	v_id UUID;
BEGIN
	SELECT c.id INTO v_id FROM creators c WHERE c.ticker = p_ticker;
	PERFORM assert_that(v_id IS NOT NULL, 404, 'Creator not found');
	RETURN v_id;
END;
$$;

-- Only the creator's own user may act for the creator (hub, Reclaim, pay).
CREATE OR REPLACE FUNCTION assert_creator_owner(p_creator UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
SET search_path = smx, public
AS $$
BEGIN
	RETURN assert_that(
		EXISTS (
			SELECT 1 FROM creators c
			WHERE c.id = p_creator AND c.owner_user_id = p_user
		),
		403, 'Only the creator can do this'
	);
END;
$$;

-- ─── pricing helpers ──────────────────────────────────────────

-- Spot price in USDC per token from the AMM reserves; NULL without a pool.
CREATE OR REPLACE FUNCTION pool_price(p_creator UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	SELECT trunc(p.usdc_reserve / p.token_reserve, 18)
	FROM pools p WHERE p.creator_id = p_creator
$$;

-- Percent change versus the last tick at or before 24h ago (or the first
-- tick when the creator is younger than a day). 0 with no history.
CREATE OR REPLACE FUNCTION creator_change_24h(p_creator UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH base AS (
		SELECT coalesce(
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator AND t.at <= now() - interval '24 hours'
				ORDER BY t.at DESC LIMIT 1
			),
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator ORDER BY t.at ASC LIMIT 1
			)
		) AS price
	)
	SELECT coalesce(
		round((pool_price(p_creator) - base.price) / nullif(base.price, 0) * 100, 2),
		0
	)
	FROM base
$$;

-- Splits `p_total` across wallets pro rata by token holdings ('HOLDINGS') or
-- by primary investment ('INVESTED'). Amounts are truncated to 6 dp and the
-- rounding remainder goes to the largest position, so the parts always sum to
-- `p_total` exactly. Zero shares are dropped.
CREATE OR REPLACE FUNCTION pro_rata_split(
	p_creator UUID, p_total NUMERIC, p_basis TEXT
)
RETURNS TABLE(wallet evm_address, amount NUMERIC)
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH weights AS (
		SELECT h.wallet, h.balance::NUMERIC AS w
		FROM holdings h
		WHERE p_basis = 'HOLDINGS' AND h.creator_id = p_creator AND h.balance > 0
		UNION ALL
		SELECT i.wallet, sum(i.usdc_amount)::NUMERIC AS w
		FROM investments i
		WHERE p_basis = 'INVESTED' AND i.creator_id = p_creator
		GROUP BY i.wallet
	),
	total AS (SELECT sum(w) AS t FROM weights),
	parts AS (
		SELECT
			weights.wallet,
			trunc(p_total * weights.w / total.t, 6) AS amt,
			row_number() OVER (ORDER BY weights.w DESC, weights.wallet) AS rn
		FROM weights, total
		WHERE total.t > 0
	)
	SELECT
		parts.wallet,
		parts.amt + CASE WHEN parts.rn = 1
			THEN p_total - (SELECT sum(amt) FROM parts) ELSE 0 END
	FROM parts
	WHERE parts.amt > 0 OR parts.rn = 1
$$;

-- ─── events and chain jobs ────────────────────────────────────

-- Appends an oracle event and one price tick at the current pool price. The
-- tick lives here so "one tick per oracle event" can't drift. Events that
-- say nothing about price (STORAGE_CONFIRMED, CREATOR_UPDATE) add no tick. The trigger on
-- oracle_events publishes it to pgmb.
CREATE OR REPLACE FUNCTION emit_oracle_event(
	p_creator UUID, p_kind oracle_event_kind, p_payload JSONB DEFAULT '{}'
)
RETURNS oracle_events
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_event oracle_events;
BEGIN
	INSERT INTO oracle_events(creator_id, kind, payload)
	SELECT c.id, p_kind, jsonb_build_object('ticker', c.ticker) || p_payload
	FROM creators c WHERE c.id = p_creator
	RETURNING * INTO v_event;

	INSERT INTO price_ticks(creator_id, price)
	SELECT p_creator, pool_price(p_creator)
	WHERE pool_price(p_creator) IS NOT NULL
		AND p_kind NOT IN ('STORAGE_CONFIRMED', 'CREATOR_UPDATE');

	RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_chain_job(
	p_creator UUID, p_fn TEXT, p_args JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE sql
SET search_path = smx, public
AS $$
	INSERT INTO chain_jobs(creator_id, fn, args)
	VALUES (p_creator, p_fn, p_args)
	RETURNING id
$$;

-- Queues a document for 0G Storage. A document whose content hash is already
-- UPLOADED is never uploaded twice: the row is born UPLOADED and the stored
-- ref applied at once. A NULL document or hash queues nothing.
CREATE OR REPLACE FUNCTION enqueue_storage_upload(
	p_creator UUID, p_kind storage_upload_kind, p_owner UUID,
	p_document JSONB, p_content_hash TEXT
)
RETURNS storage_uploads
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_row storage_uploads;
	v_done storage_uploads;
BEGIN
	IF p_document IS NULL OR p_content_hash IS NULL THEN
		RETURN NULL;
	END IF;

	INSERT INTO storage_uploads(creator_id, kind, owner_id, document, content_hash)
	VALUES (p_creator, p_kind, p_owner, p_document, p_content_hash)
	RETURNING * INTO v_row;

	SELECT * INTO v_done FROM storage_uploads u
	WHERE u.content_hash = p_content_hash AND u.status = 'UPLOADED'
	ORDER BY u.seq LIMIT 1;
	IF FOUND THEN
		v_row := complete_storage_upload(v_row.id, 'UPLOADED', v_done.ref);
	END IF;

	RETURN v_row;
END;
$$;

-- Takes one due QUEUED upload (counts the attempt and leases it for 5 minutes
-- so a second worker skips it). A document whose hash is already UPLOADED is
-- completed from that ref instead; the returned row is then UPLOADED and the
-- caller must not upload. Returns NULL when the row isn't due.
CREATE OR REPLACE FUNCTION claim_storage_upload(p_id UUID)
RETURNS storage_uploads
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_row storage_uploads;
	v_done storage_uploads;
BEGIN
	UPDATE storage_uploads u SET
		attempts = u.attempts + 1,
		next_attempt_at = now() + interval '5 minutes'
	WHERE u.id = p_id AND u.status = 'QUEUED' AND u.next_attempt_at <= now()
	RETURNING * INTO v_row;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	SELECT * INTO v_done FROM storage_uploads u
	WHERE u.content_hash = v_row.content_hash AND u.status = 'UPLOADED'
	ORDER BY u.seq LIMIT 1;
	IF FOUND THEN
		RETURN complete_storage_upload(p_id, 'UPLOADED', v_done.ref);
	END IF;

	RETURN v_row;
END;
$$;

-- Settles an upload. UPLOADED swaps the 0G root hash into the creator's
-- `terms_ref` or the proof's `audit_log_ref` (only while it still holds this
-- document's local ref) and emits STORAGE_CONFIRMED for the SSE stream.
-- SKIPPED (no key, balance below the floor) keeps the local ref. FAILED with
-- `p_transient` goes back to QUEUED with exponential backoff (30 s, 2 min)
-- until 3 attempts are used, then FAILED.
CREATE OR REPLACE FUNCTION complete_storage_upload(
	p_id UUID, p_status storage_upload_status, p_ref TEXT DEFAULT NULL,
	p_error TEXT DEFAULT NULL, p_transient BOOLEAN DEFAULT FALSE
)
RETURNS storage_uploads
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_row storage_uploads;
	v_local TEXT;
BEGIN
	SELECT * INTO v_row FROM storage_uploads u
	WHERE u.id = p_id AND u.status = 'QUEUED' FOR UPDATE;
	IF NOT FOUND THEN
		SELECT * INTO v_row FROM storage_uploads u WHERE u.id = p_id;
		RETURN v_row;
	END IF;

	IF p_status = 'FAILED' AND p_transient AND v_row.attempts < 3 THEN
		UPDATE storage_uploads u SET
			error = left(p_error, 2000),
			next_attempt_at = now() + interval '30 seconds' * power(4, greatest(v_row.attempts - 1, 0))
		WHERE u.id = p_id
		RETURNING * INTO v_row;
		RETURN v_row;
	END IF;

	UPDATE storage_uploads u SET
		status = p_status,
		ref = CASE WHEN p_status = 'UPLOADED' THEN p_ref END,
		error = CASE WHEN p_status = 'FAILED' THEN left(p_error, 2000) END
	WHERE u.id = p_id
	RETURNING * INTO v_row;

	IF p_status = 'UPLOADED' THEN
		PERFORM assert_that(p_ref IS NOT NULL, 400, 'Upload has no ref');
		v_local := 'local:' || v_row.content_hash;
		IF v_row.kind = 'LISA_TERMS' THEN
			UPDATE creators c SET terms_ref = p_ref
			WHERE c.id = v_row.owner_id AND c.terms_ref = v_local;
		ELSE
			UPDATE income_proofs ip SET audit_log_ref = p_ref
			WHERE ip.id = v_row.owner_id AND ip.audit_log_ref = v_local;
		END IF;

		PERFORM emit_oracle_event(v_row.creator_id, 'STORAGE_CONFIRMED',
			jsonb_build_object(
				'kind', v_row.kind,
				'ref', p_ref,
				'contentHash', v_row.content_hash,
				'url', 'https://indexer-storage-testnet-turbo.0g.ai/file/info/' || p_ref
			));
	END IF;

	RETURN v_row;
END;
$$;

-- 'PENDING' while the upload is queued, else UPLOADED | SKIPPED | FAILED;
-- NULL when nothing was ever queued (legacy rows). VOLATILE on purpose: it
-- must see rows written earlier in the same statement (launch_ipo).
CREATE OR REPLACE FUNCTION storage_status(
	p_kind storage_upload_kind, p_owner UUID
)
RETURNS TEXT
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT CASE u.status WHEN 'QUEUED' THEN 'PENDING' ELSE u.status::TEXT END
	FROM storage_uploads u
	WHERE u.kind = p_kind AND u.owner_id = p_owner
	ORDER BY u.seq DESC LIMIT 1
$$;

-- ─── launch_ipo ───────────────────────────────────────────────

-- Steps between proof deadlines for a cadence. The grace period (14 days)
-- is the same for both.
CREATE OR REPLACE FUNCTION proof_cadence_interval(p_cadence proof_cadence)
RETURNS INTERVAL
LANGUAGE sql IMMUTABLE
AS $$
	SELECT CASE p_cadence WHEN 'QUARTERLY' THEN interval '90 days'
		ELSE interval '30 days' END
$$;

-- Creates the creator, escrow tranches (default 20/40/40; 1 to 5 entries
-- summing to 10000 bps), the AMM pool, the first price tick and the IPO event;
-- queues the `createISA` and `initializeIPO` onchain calls. All tranches start
-- LOCKED: tranche 0 releases when the raise closes (see `finish_raise`). `p_social_links` is an object with any of `x`, `github`, `linkedin`,
-- `website`; each is checked by its domain. The first proof is due one cadence
-- after launch. Every rule is asserted here so the route stays a thin caller
-- (World ID is verified by the route first).
CREATE OR REPLACE FUNCTION launch_ipo(
	p_owner UUID,
	p_wallet evm_address,
	p_ticker TEXT,
	p_display_name TEXT,
	p_headline TEXT,
	p_share_bps INTEGER,
	p_term_months INTEGER,
	p_target_raise money_amount,
	p_stake_amount money_amount,
	p_nullifier TEXT,
	p_terms_ref TEXT,
	p_terms_hash TEXT,
	p_chain_id INTEGER DEFAULT NULL,
	p_terms_document JSONB DEFAULT NULL,
	p_tranche_bps INTEGER[] DEFAULT ARRAY[2000, 4000, 4000],
	p_proof_cadence proof_cadence DEFAULT 'MONTHLY',
	p_social_links JSONB DEFAULT '{}'
)
RETURNS creators
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
	v_seed NUMERIC;
	v_n INTEGER := cardinality(p_tranche_bps);
	v_links JSONB := coalesce(p_social_links, '{}');
BEGIN
	PERFORM assert_nullifier_available(p_nullifier);
	PERFORM assert_that(
		NOT EXISTS (SELECT 1 FROM creators c WHERE c.owner_user_id = p_owner),
		409, 'You have already launched an IPO'
	);
	PERFORM assert_that(
		NOT EXISTS (SELECT 1 FROM creators c WHERE c.ticker = p_ticker),
		409, 'That ticker is taken'
	);
	PERFORM assert_that(
		v_n BETWEEN 1 AND 5
			AND (SELECT sum(b) FROM unnest(p_tranche_bps) AS b) = 10000
			AND (SELECT min(b) FROM unnest(p_tranche_bps) AS b) > 0,
		400, 'Tranche schedule needs 1 to 5 tranches that sum to 10000 bps'
	);
	PERFORM assert_that(
		jsonb_typeof(v_links) = 'object' AND NOT EXISTS (
			SELECT 1 FROM jsonb_object_keys(v_links) AS k
			WHERE k NOT IN ('x', 'github', 'linkedin', 'website')
		),
		400, 'Social links can only be x, github, linkedin and website'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(nullif(btrim(v_links ->> 'x'), ''), 'smx.social_x_url'), TRUE),
		400, 'The X link must look like https://x.com/yourhandle'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(
			nullif(btrim(v_links ->> 'github'), ''), 'smx.social_github_url'
		), TRUE),
		400, 'The GitHub link must look like https://github.com/yourname'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(
			nullif(btrim(v_links ->> 'linkedin'), ''), 'smx.social_linkedin_url'
		), TRUE),
		400, 'The LinkedIn link must look like https://linkedin.com/in/yourname'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(
			nullif(btrim(v_links ->> 'website'), ''), 'smx.social_website_url'
		), TRUE),
		400, 'The website link must be a full https:// address'
	);

	INSERT INTO creators(
		owner_user_id, owner_wallet, ticker, display_name, headline, share_bps,
		term_months, target_raise, stake_amount, status, world_id_nullifier,
		terms_ref, terms_hash, chain_id, ipo_at, next_proof_due_at,
		proof_cadence, x_url, github_url, linkedin_url, website_url, created_by
	)
	VALUES (
		p_owner, p_wallet, p_ticker, p_display_name, coalesce(p_headline, ''),
		p_share_bps, p_term_months, p_target_raise, p_stake_amount, 'LIVE',
		p_nullifier, p_terms_ref, p_terms_hash, p_chain_id,
		now(), now() + proof_cadence_interval(p_proof_cadence), p_proof_cadence,
		nullif(btrim(v_links ->> 'x'), ''),
		nullif(btrim(v_links ->> 'github'), ''),
		nullif(btrim(v_links ->> 'linkedin'), ''),
		nullif(btrim(v_links ->> 'website'), ''), p_owner
	)
	RETURNING * INTO v_creator;

	-- The last tranche takes the rounding remainder so they sum to the target.
	INSERT INTO tranches(creator_id, idx, amount)
	SELECT
		v_creator.id,
		t.idx - 1,
		CASE WHEN t.idx = v_n
			THEN p_target_raise - coalesce(sum(trunc(p_target_raise * t.bps / 10000, 6))
				OVER (ORDER BY t.idx ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
			ELSE trunc(p_target_raise * t.bps / 10000, 6) END
	FROM unnest(p_tranche_bps) WITH ORDINALITY AS t(bps, idx);

	-- Virtual liquidity: 10% of the target (min 100) on both sides, price 1.0.
	v_seed := greatest(trunc(p_target_raise / 10, 6), 100);
	INSERT INTO pools(creator_id, usdc_reserve, token_reserve)
	VALUES (v_creator.id, v_seed, v_seed);

	PERFORM emit_oracle_event(v_creator.id, 'IPO', jsonb_build_object(
		'displayName', p_display_name,
		'targetRaise', p_target_raise::TEXT,
		'shareBps', p_share_bps,
		'termMonths', p_term_months
	));

	-- The terms ref is `local:<sha256>` until the worker uploads the document.
	PERFORM enqueue_storage_upload(
		v_creator.id, 'LISA_TERMS', v_creator.id, p_terms_document,
		substring(p_terms_ref FROM '^local:([0-9a-f]{64})$')
	);

	PERFORM enqueue_chain_job(v_creator.id, 'createISA', jsonb_build_object(
		'ticker', p_ticker,
		'creatorWallet', p_wallet::TEXT,
		'shareBps', p_share_bps,
		'termMonths', p_term_months,
		'targetRaise', p_target_raise::TEXT,
		'stakeAmount', p_stake_amount::TEXT,
		'trancheBps', to_jsonb(p_tranche_bps),
		'termsHash', p_terms_hash,
		'termsRef', p_terms_ref,
		'worldIdNullifier', p_nullifier
	));
	PERFORM enqueue_chain_job(v_creator.id, 'initializeIPO', jsonb_build_object(
		'stakeAmount', p_stake_amount::TEXT
	));

	RETURN v_creator;
END;
$$;

-- ─── creator updates ──────────────────────────────────────────

-- A creator posts a short update to holders. Only the creator's owner may post
-- (403 otherwise; 404 for an unknown ticker), at most 5 per rolling 24 hours
-- (429). Emits CREATOR_UPDATE so the live feed and the corporate-actions
-- timeline pick it up. The row is locked first so two simultaneous posts can't
-- both slip under the limit.
CREATE OR REPLACE FUNCTION post_creator_update(
	p_user UUID, p_ticker TEXT, p_body TEXT, p_link TEXT DEFAULT NULL
)
RETURNS creator_updates
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
	v_update creator_updates;
	v_body TEXT := btrim(coalesce(p_body, ''));
	v_link TEXT := nullif(btrim(coalesce(p_link, '')), '');
BEGIN
	SELECT * INTO v_creator FROM creators c
	WHERE c.id = creator_id_by_ticker(p_ticker) FOR UPDATE;
	PERFORM assert_that(
		v_creator.owner_user_id = p_user, 403,
		'Only the creator can post updates'
	);
	PERFORM assert_that(
		length(v_body) BETWEEN 1 AND 1000, 400,
		'An update needs 1 to 1,000 characters'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(v_link, 'smx.https_url'), TRUE), 400,
		'The link must be a full https:// address'
	);
	PERFORM assert_that(
		(
			SELECT count(*) FROM creator_updates u
			WHERE u.creator_id = v_creator.id
				AND u.created_at > now() - interval '24 hours'
		) < 5,
		429, 'You can post 5 updates a day. Try again tomorrow.'
	);

	INSERT INTO creator_updates(creator_id, body, link, created_by)
	VALUES (v_creator.id, v_body, v_link, p_user)
	RETURNING * INTO v_update;

	PERFORM emit_oracle_event(v_creator.id, 'CREATOR_UPDATE', jsonb_build_object(
		'updateId', v_update.id,
		'body', left(v_body, 140),
		'link', v_update.link
	));
	RETURN v_update;
END;
$$;

CREATE OR REPLACE FUNCTION creator_update_json(u creator_updates)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', u.id,
		'body', u.body,
		'link', u.link,
		'createdAt', u.created_at
	))
$$;

-- ─── raise close and supply invariant ─────────────────────────

-- True when the newest freeze/unfreeze event is a freeze (contract `frozen`).
CREATE OR REPLACE FUNCTION escrow_frozen(
	p_creator UUID, p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	SELECT coalesce((
		SELECT e.kind = 'ESCROW_FROZEN' FROM oracle_events e
		WHERE e.creator_id = p_creator
			AND e.kind IN ('ESCROW_FROZEN', 'ESCROW_UNFROZEN')
			AND e.created_at <= p_now
		ORDER BY e.created_at DESC, e.seq DESC LIMIT 1
	), FALSE)
$$;

-- Token supply check. The pool's `token_reserve` is a holder, so
-- sum(holdings) + pool tokens must equal raised + pool seed (contract:
-- totalSupply = raised + seed). `seed` is the pool's initial reserve, derived
-- from the target like at launch. Returns one row; `ok` is the invariant.
CREATE OR REPLACE FUNCTION token_supply_check(p_creator UUID)
RETURNS TABLE(supply NUMERIC, held NUMERIC, pool_tokens NUMERIC, ok BOOLEAN)
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	SELECT
		c.raised_amount + greatest(trunc(c.target_raise / 10, 6), 100),
		coalesce((SELECT sum(h.balance) FROM holdings h WHERE h.creator_id = c.id), 0),
		p.token_reserve,
		c.raised_amount + greatest(trunc(c.target_raise / 10, 6), 100)
			= coalesce((SELECT sum(h.balance) FROM holdings h WHERE h.creator_id = c.id), 0)
				+ p.token_reserve
	FROM creators c JOIN pools p ON p.creator_id = c.id
	WHERE c.id = p_creator
$$;

-- Closes the raise (contract `_closeAndRelease`): tranches resize to the amount
-- raised (last takes the remainder), tranche 0 releases, the first proof
-- deadline and the term clock start now, and the pool opens for trading.
-- Called by `record_investment` when the round fills and by `close_raise`.
CREATE OR REPLACE FUNCTION finish_raise(p_creator UUID)
RETURNS creators
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
	v_tranche tranches;
BEGIN
	UPDATE creators SET
		raise_closed_at = now(),
		next_proof_due_at = now() + proof_cadence_interval(proof_cadence)
	WHERE id = p_creator
	RETURNING * INTO v_creator;

	WITH sized AS (
		SELECT t.id, t.idx,
			trunc(t.amount * v_creator.raised_amount / v_creator.target_raise, 6) AS amt,
			t.idx = max(t.idx) OVER () AS is_last
		FROM tranches t WHERE t.creator_id = p_creator
	)
	UPDATE tranches t SET amount = CASE WHEN s.is_last
		THEN v_creator.raised_amount - coalesce((
			SELECT sum(o.amt) FROM sized o WHERE NOT o.is_last
		), 0)
		ELSE s.amt END
	FROM sized s WHERE t.id = s.id;

	UPDATE tranches SET status = 'RELEASED', released_at = now()
	WHERE creator_id = p_creator AND idx = 0
	RETURNING * INTO v_tranche;

	PERFORM emit_oracle_event(p_creator, 'TRANCHE_RELEASED', jsonb_build_object(
		'idx', v_tranche.idx, 'amount', v_tranche.amount::TEXT
	));
	RETURN v_creator;
END;
$$;

-- The creator ends the raise early (contract `closeRaise`). Needs at least one
-- investment. When `p_user` is set only the creator's owner may call. Queues
-- the `closeRaise` onchain call.
CREATE OR REPLACE FUNCTION close_raise(p_creator UUID, p_user UUID DEFAULT NULL)
RETURNS creators
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
BEGIN
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		p_user IS NULL OR assert_creator_owner(p_creator, p_user),
		403, 'Only the creator can close the raise'
	);
	PERFORM assert_that(
		v_creator.status = 'LIVE' AND v_creator.raise_closed_at IS NULL,
		409, 'This raise is not open'
	);
	PERFORM assert_that(v_creator.raised_amount > 0, 409, 'Nothing has been raised yet');
	v_creator := finish_raise(p_creator);
	PERFORM enqueue_chain_job(p_creator, 'closeRaise', '{}');
	RETURN v_creator;
END;
$$;

-- ─── record_investment ────────────────────────────────────────

-- Primary market: 1 USDC buys 1 token at the IPO price. The amount is capped
-- at the remaining raise, so the last investor fills the round rather than
-- being rejected. Filling the round closes the raise (see `finish_raise`).
CREATE OR REPLACE FUNCTION record_investment(
	p_creator UUID, p_wallet evm_address, p_usdc NUMERIC
)
RETURNS investments
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
	v_amount NUMERIC;
	v_inv investments;
BEGIN
	PERFORM assert_that(p_usdc > 0, 400, 'Amount must be positive');
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_creator.status = 'LIVE' AND v_creator.raise_closed_at IS NULL,
		409, 'This raise is not open for investment'
	);
	v_amount := least(trunc(p_usdc, 6), v_creator.target_raise - v_creator.raised_amount);
	PERFORM assert_that(v_amount > 0, 409, 'This raise is fully subscribed');

	INSERT INTO investments(creator_id, wallet, usdc_amount, token_amount)
	VALUES (p_creator, p_wallet, v_amount, v_amount)
	RETURNING * INTO v_inv;

	INSERT INTO holdings(creator_id, wallet, balance)
	VALUES (p_creator, p_wallet, v_amount)
	ON CONFLICT (creator_id, wallet)
	DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
		updated_at = now();

	UPDATE creators SET raised_amount = raised_amount + v_amount
	WHERE id = p_creator
	RETURNING * INTO v_creator;

	PERFORM emit_oracle_event(p_creator, 'INVESTED', jsonb_build_object(
		'wallet', p_wallet::TEXT,
		'usdcAmount', v_amount::TEXT,
		'tokenAmount', v_amount::TEXT
	));
	PERFORM enqueue_chain_job(p_creator, 'invest', jsonb_build_object(
		'investmentId', v_inv.id, 'wallet', p_wallet::TEXT, 'amount', v_amount::TEXT
	));
	-- The contract closes the raise inside `invest` when it fills.
	IF v_creator.raised_amount = v_creator.target_raise THEN
		PERFORM finish_raise(p_creator);
	END IF;

	RETURN v_inv;
END;
$$;

-- ─── amm_swap ─────────────────────────────────────────────────

-- Constant-product swap (x * y = k) with a 0.3% input fee that stays in the
-- pool (k grows). BUY spends `p_amount_in` USDC, SELL spends tokens. Tokens
-- move between the pool reserve and the wallet. Trading is halted until the
-- raise closes, while the escrow is frozen (GRACE) and after default. After the
-- term ends (COMPLETED) only SELL is allowed. Rejects oversells and fills below
-- `p_min_out` (slippage).
CREATE OR REPLACE FUNCTION amm_swap(
	p_creator UUID,
	p_wallet evm_address,
	p_side trade_side,
	p_amount_in NUMERIC,
	p_min_out NUMERIC DEFAULT 0
)
RETURNS trades
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_status creator_status;
	v_closed TIMESTAMPTZ;
	v_pool pools;
	v_fee NUMERIC;
	v_eff NUMERIC;
	v_out NUMERIC;
	v_usdc NUMERIC;
	v_tokens NUMERIC;
	v_trade trades;
BEGIN
	PERFORM assert_that(p_amount_in > 0, 400, 'Amount must be positive');
	SELECT c.status, c.raise_closed_at INTO v_status, v_closed
	FROM creators c WHERE c.id = p_creator;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE', 'COMPLETED'), 409,
		CASE WHEN v_status = 'DEFAULTED'
			THEN 'Trading is closed: this creator defaulted'
			ELSE 'Trading is not open for this creator' END
	);
	PERFORM assert_that(
		v_closed IS NOT NULL, 409, 'Trading opens when the raise closes'
	);
	PERFORM assert_that(
		v_status = 'COMPLETED'
			OR (v_status <> 'GRACE' AND NOT escrow_frozen(p_creator)),
		409, 'Trading is halted: the escrow is frozen'
	);
	PERFORM assert_that(
		v_status <> 'COMPLETED' OR p_side = 'SELL', 409,
		'Term ended: only selling is allowed'
	);
	SELECT * INTO v_pool FROM pools p WHERE p.creator_id = p_creator FOR UPDATE;

	v_fee := p_amount_in * 0.003;
	v_eff := p_amount_in - v_fee;

	IF p_side = 'BUY' THEN
		v_out := trunc(v_pool.token_reserve * v_eff / (v_pool.usdc_reserve + v_eff), 18);
		v_usdc := trunc(p_amount_in, 6);
		v_tokens := v_out;
	ELSE
		PERFORM assert_that(
			coalesce((
				SELECT h.balance FROM holdings h
				WHERE h.creator_id = p_creator AND h.wallet = p_wallet
			), 0) >= p_amount_in,
			409, 'Insufficient token balance'
		);
		v_out := trunc(v_pool.usdc_reserve * v_eff / (v_pool.token_reserve + v_eff), 6);
		v_usdc := v_out;
		v_tokens := p_amount_in;
	END IF;

	PERFORM assert_that(v_out > 0, 400, 'Amount is too small to trade');
	PERFORM assert_that(
		v_out >= coalesce(p_min_out, 0), 409,
		'Slippage: price moved, output is below your minimum'
	);

	IF p_side = 'BUY' THEN
		UPDATE pools SET
			usdc_reserve = usdc_reserve + v_usdc,
			token_reserve = token_reserve - v_tokens,
			updated_at = now()
		WHERE creator_id = p_creator;
		INSERT INTO holdings(creator_id, wallet, balance)
		VALUES (p_creator, p_wallet, v_tokens)
		ON CONFLICT (creator_id, wallet)
		DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
			updated_at = now();
	ELSE
		UPDATE pools SET
			usdc_reserve = usdc_reserve - v_usdc,
			token_reserve = token_reserve + v_tokens,
			updated_at = now()
		WHERE creator_id = p_creator;
		UPDATE holdings SET balance = balance - v_tokens, updated_at = now()
		WHERE creator_id = p_creator AND wallet = p_wallet;
	END IF;

	INSERT INTO trades(creator_id, wallet, side, usdc_amount, token_amount, price, fee)
	VALUES (
		p_creator, p_wallet, p_side, v_usdc, v_tokens,
		trunc(v_usdc / v_tokens, 18), v_fee
	)
	RETURNING * INTO v_trade;

	PERFORM emit_oracle_event(p_creator, 'TRADE', jsonb_build_object(
		'side', p_side,
		'wallet', p_wallet::TEXT,
		'usdcAmount', v_usdc::TEXT,
		'tokenAmount', v_tokens::TEXT,
		'price', v_trade.price::TEXT
	));

	RETURN v_trade;
END;
$$;

-- ─── income proofs and dividends ──────────────────────────────

-- Stores a verified Reclaim proof as PENDING. `p_period` defaults to the next
-- unapproved month. The same Reclaim proof id can't be stored twice (409).
CREATE OR REPLACE FUNCTION submit_income_proof(
	p_creator UUID,
	p_provider TEXT,
	p_reclaim_proof_id TEXT,
	p_amount money_amount,
	p_raw JSONB DEFAULT NULL,
	p_period INTEGER DEFAULT NULL,
	p_reclaim_session_id TEXT DEFAULT NULL
)
RETURNS income_proofs
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_status creator_status;
	v_closed TIMESTAMPTZ;
	v_proof income_proofs;
BEGIN
	SELECT c.status, c.raise_closed_at INTO v_status, v_closed
	FROM creators c WHERE c.id = p_creator;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE') AND v_closed IS NOT NULL, 409,
		'This creator is not accepting proofs'
	);
	-- Retrying a proof whose 0G audit was unavailable returns the PENDING row.
	SELECT * INTO v_proof FROM income_proofs ip
	WHERE ip.creator_id = p_creator AND ip.reclaim_proof_id = p_reclaim_proof_id;
	IF FOUND THEN
		PERFORM assert_that(v_proof.status = 'PENDING', 409, 'This proof was already submitted');
		RETURN v_proof;
	END IF;

	INSERT INTO income_proofs(
		creator_id, period, provider, reclaim_proof_id, verified_amount, raw,
		reclaim_session_id
	)
	VALUES (
		p_creator,
		coalesce(p_period, (
			SELECT count(*)::INTEGER FROM income_proofs ip
			WHERE ip.creator_id = p_creator AND ip.status = 'APPROVED'
		)),
		p_provider, p_reclaim_proof_id, p_amount, p_raw, p_reclaim_session_id
	)
	RETURNING * INTO v_proof;

	UPDATE reclaim_sessions SET status = 'SUCCESS', proof_id = v_proof.id
	WHERE id = p_reclaim_session_id AND creator_id = p_creator;
	RETURN v_proof;
END;
$$;

-- No 0G auditor answered: keep the proof PENDING and say why, so the UI shows
-- "0G audit unavailable, retry" and submitting the same proof again retries.
CREATE OR REPLACE FUNCTION mark_audit_unavailable(p_proof UUID, p_message TEXT)
RETURNS income_proofs
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_proof income_proofs;
BEGIN
	UPDATE income_proofs SET audit = jsonb_build_object(
		'status', 'AUDIT_UNAVAILABLE', 'message', left(p_message, 300)
	)
	WHERE id = p_proof AND status = 'PENDING'
	RETURNING * INTO v_proof;
	PERFORM assert_that(FOUND, 409, 'Proof was already audited');
	RETURN v_proof;
END;
$$;

-- The rules engine. Approves when the accepted income meets `min_income`, the
-- period isn't already approved, and the auditor (0G) didn't veto
-- (`audit.approved = false`); the auditor can only tighten, never override,
-- these rules. Approval creates the dividend, releases the next locked
-- tranche, pushes the proof deadline out by the creator's cadence (30 or 90
-- days), clears grace, and emits
-- events plus chain jobs. Rejection records why and emits PROOF_REJECTED.
CREATE OR REPLACE FUNCTION audit_income_proof(
	p_proof UUID, p_verified_amount money_amount, p_audit JSONB DEFAULT '{}',
	p_log_document JSONB DEFAULT NULL
)
RETURNS income_proofs
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_proof income_proofs;
	v_creator creators;
	v_reason TEXT;
	v_dividend dividends;
	v_tranche tranches;
BEGIN
	SELECT * INTO v_proof FROM income_proofs ip WHERE ip.id = p_proof FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Proof not found');
	PERFORM assert_that(v_proof.status = 'PENDING', 409, 'Proof was already audited');
	SELECT * INTO v_creator FROM creators c
	WHERE c.id = v_proof.creator_id FOR UPDATE;
	PERFORM assert_that(
		v_creator.status IN ('LIVE', 'GRACE') AND v_creator.raise_closed_at IS NOT NULL,
		409, 'This creator is not accepting proofs'
	);

	v_reason := CASE
		WHEN p_verified_amount < v_creator.min_income
			THEN 'Income is below the ' || v_creator.min_income::TEXT || ' USDC minimum'
		WHEN EXISTS (
			SELECT 1 FROM income_proofs ip
			WHERE ip.creator_id = v_proof.creator_id
				AND ip.period = v_proof.period AND ip.status = 'APPROVED'
		) THEN 'Period ' || v_proof.period || ' is already approved'
		WHEN coalesce((p_audit ->> 'approved')::BOOLEAN, TRUE) IS FALSE
			THEN coalesce(nullif(btrim(p_audit ->> 'reasoning'), ''), 'Auditor rejected the proof')
	END;

	IF v_reason IS NOT NULL THEN
		UPDATE income_proofs SET
			status = 'REJECTED',
			verified_amount = p_verified_amount,
			audit = coalesce(p_audit, '{}') || jsonb_build_object('reason', v_reason),
			audit_log_ref = p_audit ->> 'logRef'
		WHERE id = p_proof
		RETURNING * INTO v_proof;
		PERFORM enqueue_storage_upload(
			v_creator.id, 'AUDIT_LOG', p_proof, p_log_document,
			substring(p_audit ->> 'logRef' FROM '^local:([0-9a-f]{64})$')
		);
		PERFORM emit_oracle_event(v_creator.id, 'PROOF_REJECTED', jsonb_build_object(
			'proofId', p_proof, 'period', v_proof.period, 'reason', v_reason,
			'amount', p_verified_amount::TEXT
		));
		RETURN v_proof;
	END IF;

	UPDATE income_proofs SET
		status = 'APPROVED',
		verified_amount = p_verified_amount,
		audit = p_audit,
		audit_log_ref = p_audit ->> 'logRef'
	WHERE id = p_proof
	RETURNING * INTO v_proof;

	-- The log ref is `local:<sha256>` until the worker uploads the document.
	PERFORM enqueue_storage_upload(
		v_creator.id, 'AUDIT_LOG', p_proof, p_log_document,
		substring(p_audit ->> 'logRef' FROM '^local:([0-9a-f]{64})$')
	);

	INSERT INTO dividends(creator_id, proof_id, amount_due)
	VALUES (
		v_creator.id, p_proof,
		round(p_verified_amount * v_creator.share_bps / 10000, 6)
	)
	RETURNING * INTO v_dividend;

	-- Release the earliest locked tranche, if any remain.
	UPDATE tranches SET status = 'RELEASED', released_at = now()
	WHERE id = (
		SELECT t.id FROM tranches t
		WHERE t.creator_id = v_creator.id AND t.status = 'LOCKED'
		ORDER BY t.idx LIMIT 1 FOR UPDATE
	)
	RETURNING * INTO v_tranche;

	-- A late proof inside the grace period lifts the escrow freeze.
	IF v_creator.status = 'GRACE' THEN
		PERFORM emit_oracle_event(v_creator.id, 'ESCROW_UNFROZEN', jsonb_build_object(
			'proofId', p_proof, 'period', v_proof.period
		));
		PERFORM enqueue_chain_job(v_creator.id, 'unfreezeEscrow', '{}');
	END IF;

	-- From the later of the old deadline and now, so a late proof doesn't
	-- leave the creator immediately overdue again.
	UPDATE creators SET
		next_proof_due_at = greatest(next_proof_due_at, now())
			+ proof_cadence_interval(v_creator.proof_cadence),
		grace_until = NULL,
		status = 'LIVE'
	WHERE id = v_creator.id;

	PERFORM emit_oracle_event(v_creator.id, 'PROOF_VERIFIED', jsonb_build_object(
		'proofId', p_proof,
		'period', v_proof.period,
		'amount', p_verified_amount::TEXT,
		'dividendId', v_dividend.id,
		'dividendDue', v_dividend.amount_due::TEXT,
		'model', p_audit ->> 'model',
		'reasoning', p_audit ->> 'reasoning'
	));

	IF v_tranche.id IS NOT NULL THEN
		PERFORM emit_oracle_event(v_creator.id, 'TRANCHE_RELEASED', jsonb_build_object(
			'idx', v_tranche.idx, 'amount', v_tranche.amount::TEXT
		));
		PERFORM enqueue_chain_job(v_creator.id, 'unlockNextTranche', jsonb_build_object(
			'idx', v_tranche.idx, 'amount', v_tranche.amount::TEXT
		));
	END IF;

	RETURN v_proof;
END;
$$;

-- Marks a dividend paid and emits DIVIDEND_PAID with the per-holder split
-- (pro rata by holdings at payment time), recorded as payouts. When `p_user`
-- is set only the creator's owner may pay. The onchain
-- `distributeDividend` call is queued; `tx_hash` may arrive later from the
-- worker. The Hedera stream (worker) reacts to the event.
CREATE OR REPLACE FUNCTION pay_dividend(
	p_dividend UUID, p_tx_hash tx_hash DEFAULT NULL, p_user UUID DEFAULT NULL
)
RETURNS dividends
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_div dividends;
	v_splits JSONB;
BEGIN
	SELECT * INTO v_div FROM dividends d WHERE d.id = p_dividend FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Dividend not found');
	-- `p_user` is the caller; NULL means a system call (worker, seed).
	PERFORM assert_that(
		p_user IS NULL OR assert_creator_owner(v_div.creator_id, p_user),
		403, 'Only the creator can pay this dividend'
	);
	PERFORM assert_that(v_div.status = 'DUE', 409, 'Dividend was already paid');

	UPDATE dividends SET status = 'PAID', paid_tx_hash = p_tx_hash, paid_at = now()
	WHERE id = p_dividend
	RETURNING * INTO v_div;

	INSERT INTO payouts(creator_id, dividend_id, wallet, kind, amount)
	SELECT v_div.creator_id, p_dividend, s.wallet, 'DIVIDEND', s.amount
	FROM pro_rata_split(v_div.creator_id, v_div.amount_due, 'HOLDINGS') s;

	SELECT coalesce(jsonb_agg(
		jsonb_build_object('wallet', po.wallet::TEXT, 'amount', po.amount::TEXT)
		ORDER BY po.amount DESC, po.wallet
	), '[]')
	INTO v_splits
	FROM payouts po WHERE po.dividend_id = p_dividend;

	PERFORM emit_oracle_event(v_div.creator_id, 'DIVIDEND_PAID', jsonb_build_object(
		'dividendId', p_dividend,
		'amount', v_div.amount_due::TEXT,
		'splits', v_splits
	) || CASE WHEN dividend_settlement_tx(v_div) IS NOT NULL
		THEN jsonb_build_object('txId', dividend_settlement_tx(v_div))
		ELSE '{}'::JSONB END);
	-- Paying the last overdue dividend inside the grace period cures a GRACE
	-- that the dividend caused (the proof deadline itself is still ahead).
	IF EXISTS (
		SELECT 1 FROM creators c
		WHERE c.id = v_div.creator_id AND c.status = 'GRACE'
			AND c.next_proof_due_at >= now()
	) AND NOT EXISTS (
		SELECT 1 FROM dividends d
		JOIN creators c ON c.id = d.creator_id
		WHERE d.creator_id = v_div.creator_id AND d.status = 'DUE'
			AND d.created_at + proof_cadence_interval(c.proof_cadence) < now()
	) THEN
		UPDATE creators SET status = 'LIVE', grace_until = NULL
		WHERE id = v_div.creator_id;
		PERFORM emit_oracle_event(v_div.creator_id, 'ESCROW_UNFROZEN', jsonb_build_object(
			'dividendId', p_dividend
		));
		PERFORM enqueue_chain_job(v_div.creator_id, 'unfreezeEscrow', '{}');
	END IF;
	PERFORM enqueue_chain_job(v_div.creator_id, 'distributeDividend', jsonb_build_object(
		'dividendId', p_dividend, 'amount', v_div.amount_due::TEXT
	));

	RETURN v_div;
END;
$$;

-- ─── chain job settlement ─────────────────────────────────────

-- Settles a chain job after the worker sent it: stores status, tx hash and
-- error, and copies the result onto the domain row it touches (deployed
-- addresses on the creator, tx hash on the tranche, dividend or investment).
-- The update fires `smx.chain_jobs.update` for the SSE stream. Only a QUEUED
-- or SENT job settles, so a retried worker can't overwrite a final state.
CREATE OR REPLACE FUNCTION complete_chain_job(
	p_job UUID,
	p_status chain_job_status,
	p_tx_hash tx_hash DEFAULT NULL,
	p_error TEXT DEFAULT NULL,
	p_isa evm_address DEFAULT NULL,
	p_token evm_address DEFAULT NULL,
	p_ats_token evm_address DEFAULT NULL
)
RETURNS chain_jobs
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_job chain_jobs;
BEGIN
	UPDATE chain_jobs SET status = p_status, tx_hash = p_tx_hash, error = p_error
	WHERE id = p_job AND status IN ('QUEUED', 'SENT')
	RETURNING * INTO v_job;
	PERFORM assert_that(FOUND, 409, 'Chain job already settled or missing');

	IF p_status IN ('CONFIRMED', 'SIMULATED') THEN
		IF v_job.fn = 'createISA' AND p_isa IS NOT NULL THEN
			UPDATE creators SET
				contract_address = p_isa, token_address = p_token,
				ats_token_address = p_ats_token
			WHERE id = v_job.creator_id;
		ELSIF v_job.fn = 'unlockNextTranche' THEN
			UPDATE tranches SET tx_hash = p_tx_hash
			WHERE creator_id = v_job.creator_id
				AND idx = (v_job.args ->> 'idx')::INTEGER;
		ELSIF v_job.fn = 'distributeDividend' THEN
			UPDATE dividends SET paid_tx_hash = p_tx_hash
			WHERE id = (v_job.args ->> 'dividendId')::UUID;
		ELSIF v_job.fn = 'invest' THEN
			UPDATE investments SET tx_hash = p_tx_hash
			WHERE id = (v_job.args ->> 'investmentId')::UUID;
		END IF;
	END IF;

	RETURN v_job;
END;
$$;

-- ─── deadlines and default ────────────────────────────────────

-- Refunds locked escrow and slashes the creator stake, both pro rata to the
-- current token holders (pool excluded: it isn't in `holdings`; with no
-- holders the stake goes back to the creator), blacklists the World ID nullifier, marks DEFAULTED, emits
-- DEFAULTED and queues `executeLiquidation`. While the raise is still open,
-- locked tranches are scaled by raised/target because they are sized on the
-- target; `finish_raise` resizes them to the amount raised.
CREATE OR REPLACE FUNCTION liquidate_creator(p_creator UUID)
RETURNS creators
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
	v_locked NUMERIC;
	v_refund NUMERIC;
	v_refunds INTEGER;
	v_slashes INTEGER;
BEGIN
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_creator.status IN ('LIVE', 'GRACE'), 409, 'Creator cannot be liquidated'
	);

	SELECT coalesce(sum(t.amount), 0) INTO v_locked
	FROM tranches t WHERE t.creator_id = p_creator AND t.status = 'LOCKED';
	v_refund := CASE WHEN v_creator.raise_closed_at IS NULL
		THEN trunc(v_locked * v_creator.raised_amount / v_creator.target_raise, 6)
		ELSE v_locked END;

	UPDATE tranches SET status = 'REFUNDED'
	WHERE creator_id = p_creator AND status = 'LOCKED';

	INSERT INTO payouts(creator_id, wallet, kind, amount)
	SELECT p_creator, s.wallet, 'REFUND', s.amount
	FROM pro_rata_split(p_creator, v_refund, 'HOLDINGS') s
	WHERE s.amount > 0;
	GET DIAGNOSTICS v_refunds = ROW_COUNT;

	INSERT INTO payouts(creator_id, wallet, kind, amount)
	SELECT p_creator, s.wallet, 'SLASH', s.amount
	FROM pro_rata_split(p_creator, v_creator.stake_amount, 'HOLDINGS') s;
	GET DIAGNOSTICS v_slashes = ROW_COUNT;
	IF v_slashes = 0 THEN
		PERFORM emit_oracle_event(p_creator, 'STAKE_RETURNED', jsonb_build_object(
			'amount', v_creator.stake_amount::TEXT, 'reason', 'No holders to slash'
		));
	END IF;

	INSERT INTO blacklisted_nullifiers(nullifier, creator_id)
	VALUES (v_creator.world_id_nullifier, p_creator)
	ON CONFLICT (nullifier) DO NOTHING;

	UPDATE creators SET status = 'DEFAULTED' WHERE id = p_creator
	RETURNING * INTO v_creator;

	PERFORM emit_oracle_event(p_creator, 'DEFAULTED', jsonb_build_object(
		'refundTotal', (
			SELECT coalesce(sum(po.amount), 0)::TEXT FROM payouts po
			WHERE po.creator_id = p_creator AND po.kind = 'REFUND'
		),
		'slashTotal', (
			SELECT coalesce(sum(po.amount), 0)::TEXT FROM payouts po
			WHERE po.creator_id = p_creator AND po.kind = 'SLASH'
		),
		'refunds', v_refunds,
		'slashes', v_slashes
	));
	PERFORM enqueue_chain_job(p_creator, 'executeLiquidation', '{}');

	RETURN v_creator;
END;
$$;

-- Safe-stop fallback: the 0G agent freezes the Hedera escrow while a creator
-- is in GRACE (no more tranche releases or dividend distributions); a late
-- approved proof lifts it (see `audit_income_proof`). Liquidation still
-- follows when the grace period ends.
CREATE OR REPLACE FUNCTION freeze_escrow(p_creator UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
BEGIN
	PERFORM emit_oracle_event(p_creator, 'ESCROW_FROZEN', jsonb_build_object(
		'reason', p_reason
	));
	RETURN enqueue_chain_job(p_creator, 'freezeEscrow', '{}');
END;
$$;

-- Periodic deadline sweep (creators whose raise is closed). LIVE creators
-- past `next_proof_due_at`, or with a dividend unpaid for a full cadence
-- (`created_at` + cadence), enter GRACE for 14 days and the escrow freezes;
-- GRACE creators past `grace_until` are liquidated; LIVE creators past the term
-- end (raise close + term_months * 30 days, like the contract) complete and
-- their stake is returned (STAKE_RETURNED + `reclaimStake`). `SKIP LOCKED` lets
-- overlapping sweeps (cron plus a manual call) run without blocking or
-- double-acting. Returns what changed.
CREATE OR REPLACE FUNCTION sweep_deadlines(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE(creator_id UUID, transition TEXT)
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	r RECORD;
	v_reason TEXT;
BEGIN
	FOR r IN
		SELECT c.id, c.status, c.raise_closed_at, c.term_months,
			c.next_proof_due_at, c.grace_until, c.stake_amount,
			EXISTS (
				SELECT 1 FROM dividends d
				WHERE d.creator_id = c.id AND d.status = 'DUE'
					AND d.created_at + proof_cadence_interval(c.proof_cadence) < p_now
			) AS dividend_overdue
		FROM creators c
		WHERE c.status IN ('LIVE', 'GRACE') AND c.raise_closed_at IS NOT NULL
		ORDER BY c.id
		FOR UPDATE SKIP LOCKED
	LOOP
		IF r.status = 'GRACE' AND r.grace_until < p_now THEN
			PERFORM liquidate_creator(r.id);
			creator_id := r.id; transition := 'DEFAULTED'; RETURN NEXT;
		ELSIF r.status = 'LIVE'
			AND r.raise_closed_at + r.term_months * interval '30 days' < p_now THEN
			UPDATE creators SET status = 'COMPLETED' WHERE id = r.id;
			PERFORM emit_oracle_event(r.id, 'STAKE_RETURNED', jsonb_build_object(
				'amount', r.stake_amount::TEXT
			));
			PERFORM enqueue_chain_job(r.id, 'reclaimStake', jsonb_build_object(
				'amount', r.stake_amount::TEXT
			));
			creator_id := r.id; transition := 'COMPLETED'; RETURN NEXT;
		ELSIF r.status = 'LIVE'
			AND (r.next_proof_due_at < p_now OR r.dividend_overdue) THEN
			v_reason := CASE WHEN r.next_proof_due_at < p_now
				THEN 'Proof deadline missed' ELSE 'Dividend unpaid' END;
			UPDATE creators SET
				status = 'GRACE', grace_until = p_now + interval '14 days'
			WHERE id = r.id;
			PERFORM emit_oracle_event(r.id, 'GRACE_STARTED', jsonb_build_object(
				'graceUntil', p_now + interval '14 days', 'reason', v_reason
			));
			PERFORM freeze_escrow(r.id, v_reason);
			creator_id := r.id; transition := 'GRACE'; RETURN NEXT;
		END IF;
	END LOOP;
END;
$$;

-- ─── demo helpers ─────────────────────────────────────────────

-- Demo only (the route gates on DEMO_MODE): fast-forwards the deadline and
-- grace period, then liquidates.
CREATE OR REPLACE FUNCTION demo_trigger_default(p_ticker TEXT)
RETURNS creators
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_id UUID := creator_id_by_ticker(p_ticker);
	v_status creator_status;
BEGIN
	SELECT c.status INTO v_status FROM creators c WHERE c.id = v_id FOR UPDATE;
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE'), 409, 'Creator is not live'
	);
	IF v_status = 'LIVE' THEN
		PERFORM emit_oracle_event(v_id, 'GRACE_STARTED', jsonb_build_object(
			'graceUntil', now()
		));
		PERFORM freeze_escrow(v_id, 'Proof deadline missed');
	END IF;
	UPDATE creators SET
		status = 'GRACE',
		next_proof_due_at = now() - interval '15 days',
		grace_until = now()
	WHERE id = v_id;
	RETURN liquidate_creator(v_id);
END;
$$;

-- Seed only: spreads a creator's history evenly over the last `p_span` so
-- charts have a 7-day shape. Ticks and events are 1:1, so they stay aligned.
CREATE OR REPLACE FUNCTION demo_spread_history(p_creator UUID, p_span INTERVAL)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_start TIMESTAMPTZ := clock_timestamp() - p_span;
BEGIN
	UPDATE price_ticks t SET at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY at, id) AS rn, count(*) OVER () AS n
		FROM price_ticks WHERE creator_id = p_creator
	) r WHERE t.id = r.id;

	UPDATE oracle_events e SET created_at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn, count(*) OVER () AS n
		FROM oracle_events WHERE creator_id = p_creator
	) r WHERE e.id = r.id;

	UPDATE trades t SET created_at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn, count(*) OVER () AS n
		FROM trades WHERE creator_id = p_creator
	) r WHERE t.id = r.id;

	UPDATE investments i SET created_at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn, count(*) OVER () AS n
		FROM investments WHERE creator_id = p_creator
	) r WHERE i.id = r.id;

	UPDATE creators SET
		ipo_at = v_start,
		next_proof_due_at = next_proof_due_at - p_span
	WHERE id = p_creator;
END;
$$;

-- ─── JSON builders ────────────────────────────────────────────
-- `<entity>_json` build the API shapes (see openapi.yaml schemas) in SQL, so
-- routes stream `row.j` straight to `res.json`. Money and prices are TEXT to
-- keep exact decimals; nulls are stripped so optional fields are absent.
-- They are deliberately VOLATILE (no STABLE): a STABLE function reads the
-- calling statement's snapshot, so `SELECT creator_json(c) FROM launch_ipo(..)`
-- would not see the rows launch_ipo just wrote.

CREATE OR REPLACE FUNCTION tranche_json(t tranches)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'idx', t.idx,
		'amount', t.amount::TEXT,
		'status', t.status,
		'releasedAt', t.released_at,
		'txHash', t.tx_hash
	))
$$;

CREATE OR REPLACE FUNCTION chain_job_json(j chain_jobs)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', j.id,
		'creatorId', j.creator_id,
		'fn', j.fn,
		'status', j.status,
		'txHash', j.tx_hash,
		'error', j.error,
		'createdAt', j.created_at,
		'updatedAt', j.updated_at
	))
$$;

CREATE OR REPLACE FUNCTION oracle_event_json(e oracle_events)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_build_object(
		'id', e.id,
		'seq', e.seq,
		'creatorId', e.creator_id,
		'ticker', e.payload ->> 'ticker',
		'kind', e.kind,
		'payload', e.payload,
		'createdAt', e.created_at
	)
$$;

CREATE OR REPLACE FUNCTION income_proof_json(p income_proofs)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', p.id,
		'creatorId', p.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = p.creator_id),
		'period', p.period,
		'provider', p.provider,
		'reclaimProofId', p.reclaim_proof_id,
		'verifiedAmount', p.verified_amount::TEXT,
		'status', p.status,
		'reasoning', p.audit ->> 'reasoning',
		'rejectReason', p.audit ->> 'reason',
		'model', p.audit ->> 'model',
		'auditStatus', p.audit ->> 'status',
		'auditMessage', p.audit ->> 'message',
		'engine', p.audit ->> 'engine',
		'requestId', p.audit ->> 'requestId',
		'providerAddress', p.audit ->> 'providerAddress',
		'teeVerified', (p.audit ->> 'teeVerified')::BOOLEAN,
		'trustMode', p.audit ->> 'trustMode',
		'auditLogRef', p.audit_log_ref,
		'auditLogStorage', storage_status('AUDIT_LOG', p.id),
		'createdAt', p.created_at
	))
$$;

-- Hedera settlement tx id (`0.0.x@s.n`) of a dividend, from the stored stream
-- receipts (`{status, receipts: ["<txId>#..."]}`). NULL until settled. It never
-- goes in `paid_tx_hash`, which only holds 0x hashes.
CREATE OR REPLACE FUNCTION dividend_settlement_tx(d dividends)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
	SELECT nullif(split_part(d.stream_receipts -> 'receipts' ->> 0, '#', 1), '')
$$;

CREATE OR REPLACE FUNCTION dividend_json(d dividends)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', d.id,
		'creatorId', d.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = d.creator_id),
		'proofId', d.proof_id,
		'period', (SELECT p.period FROM income_proofs p WHERE p.id = d.proof_id),
		'amountDue', d.amount_due::TEXT,
		'status', d.status,
		'paidTxHash', d.paid_tx_hash,
		'settlementTxId', dividend_settlement_tx(d),
		'paidAt', d.paid_at,
		'createdAt', d.created_at
	))
$$;

CREATE OR REPLACE FUNCTION trade_json(t trades)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', t.id,
		'creatorId', t.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = t.creator_id),
		'wallet', t.wallet::TEXT,
		'side', t.side,
		'usdcAmount', t.usdc_amount::TEXT,
		'tokenAmount', t.token_amount::TEXT,
		'price', t.price::TEXT,
		'fee', t.fee::TEXT,
		'txHash', t.tx_hash,
		'createdAt', t.created_at
	))
$$;

CREATE OR REPLACE FUNCTION holding_json(h holdings)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'creatorId', h.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = h.creator_id),
		'wallet', h.wallet::TEXT,
		'userId', (
			SELECT w.user_id FROM wallet_addresses w
			WHERE w.address = h.wallet
			ORDER BY w.is_primary DESC, w.created_at
			LIMIT 1
		),
		'balance', h.balance::TEXT,
		'sharePct', (
			SELECT round(h.balance / nullif(sum(x.balance), 0) * 100, 2)
			FROM holdings x WHERE x.creator_id = h.creator_id
		),
		'value', trunc(h.balance * coalesce(pool_price(h.creator_id), 0), 6)::TEXT
	))
$$;

CREATE OR REPLACE FUNCTION investment_json(i investments)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', i.id,
		'creatorId', i.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = i.creator_id),
		'wallet', i.wallet::TEXT,
		'usdcAmount', i.usdc_amount::TEXT,
		'tokenAmount', i.token_amount::TEXT,
		'txHash', i.tx_hash,
		'createdAt', i.created_at,
		'holding', (
			SELECT holding_json(h) FROM holdings h
			WHERE h.creator_id = i.creator_id AND h.wallet = i.wallet
		)
	))
$$;

-- Price history for charts, oldest first, capped so a busy token can't
-- return an unbounded array.
CREATE OR REPLACE FUNCTION price_points_json(p_creator UUID, p_limit INTEGER)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT coalesce(jsonb_agg(
		jsonb_build_object('at', t.at, 'price', t.price::TEXT) ORDER BY t.at
	), '[]')
	FROM (
		SELECT pt.at, pt.price FROM price_ticks pt
		WHERE pt.creator_id = p_creator
		ORDER BY pt.at DESC LIMIT p_limit
	) t
$$;

-- Row of the exchange list and trending strip: price, 24h change and a
-- sparkline computed from price_ticks.
CREATE OR REPLACE FUNCTION creator_summary_json(c creators)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', c.id,
		'ticker', c.ticker,
		'displayName', c.display_name,
		'headline', c.headline,
		'status', c.status,
		'price', coalesce(pool_price(c.id), 0)::TEXT,
		'change24h', creator_change_24h(c.id),
		'volume24h', (
			SELECT coalesce(sum(t.usdc_amount), 0)::TEXT FROM trades t
			WHERE t.creator_id = c.id AND t.created_at > now() - interval '24 hours'
		),
		'raised', c.raised_amount::TEXT,
		'targetRaise', c.target_raise::TEXT,
		'shareBps', c.share_bps,
		'sparkline', price_points_json(c.id, 30)
	))
$$;

-- Full creator document: terms, tranches, escrow totals, chain status.
CREATE OR REPLACE FUNCTION creator_json(c creators)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT creator_summary_json(c) || jsonb_strip_nulls(jsonb_build_object(
		'ownerWallet', c.owner_wallet::TEXT,
		'termMonths', c.term_months,
		'stakeAmount', c.stake_amount::TEXT,
		'minIncome', c.min_income::TEXT,
		'termsRef', c.terms_ref,
		'termsStorage', storage_status('LISA_TERMS', c.id),
		'termsHash', c.terms_hash,
		'contractAddress', c.contract_address::TEXT,
		'tokenAddress', c.token_address::TEXT,
		'atsTokenAddress', c.ats_token_address::TEXT,
		'chainId', c.chain_id,
		'nextProofDueAt', c.next_proof_due_at,
		'graceUntil', c.grace_until,
		'ipoAt', c.ipo_at,
		'createdAt', c.created_at,
		'proofCadence', c.proof_cadence,
		'socialLinks', jsonb_build_object(
			'x', c.x_url, 'github', c.github_url,
			'linkedin', c.linkedin_url, 'website', c.website_url
		),
		'tranches', (
			SELECT coalesce(jsonb_agg(tranche_json(t) ORDER BY t.idx), '[]')
			FROM tranches t WHERE t.creator_id = c.id
		),
		'escrow', (
			SELECT jsonb_build_object(
				'locked', coalesce(sum(t.amount) FILTER (WHERE t.status = 'LOCKED'), 0)::TEXT,
				'released', coalesce(sum(t.amount) FILTER (WHERE t.status = 'RELEASED'), 0)::TEXT,
				'refunded', coalesce(sum(t.amount) FILTER (WHERE t.status = 'REFUNDED'), 0)::TEXT
			)
			FROM tranches t WHERE t.creator_id = c.id
		),
		'chain', jsonb_build_object(
			'pendingJobs', (
				SELECT count(*) FROM chain_jobs j
				WHERE j.creator_id = c.id AND j.status IN ('QUEUED', 'SENT')
			),
			'lastTxHash', (
				SELECT j.tx_hash FROM chain_jobs j
				WHERE j.creator_id = c.id AND j.tx_hash IS NOT NULL
				ORDER BY j.seq DESC LIMIT 1
			)
		)
	))
$$;

CREATE OR REPLACE FUNCTION reclaim_session_json(r reclaim_sessions)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'sessionId', r.id,
		'creatorId', r.creator_id,
		'status', r.status,
		'failureReason', r.failure_reason,
		'proofId', r.proof_id,
		'proofStatus', (SELECT p.status FROM income_proofs p WHERE p.id = r.proof_id),
		'createdAt', r.created_at,
		'updatedAt', r.updated_at
	))
$$;

-- Moves a PENDING session to a terminal status exactly once (a repeated or
-- late callback is a no-op). Returns the session either way.
CREATE OR REPLACE FUNCTION finish_reclaim_session(
	p_session TEXT, p_status reclaim_session_status, p_reason TEXT DEFAULT NULL
)
RETURNS reclaim_sessions
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_row reclaim_sessions;
BEGIN
	UPDATE reclaim_sessions SET
		status = p_status, failure_reason = left(p_reason, 500)
	WHERE id = p_session AND status = 'PENDING'
	RETURNING * INTO v_row;
	IF NOT FOUND THEN
		SELECT * INTO v_row FROM reclaim_sessions WHERE id = p_session;
	END IF;
	RETURN v_row;
END;
$$;

-- Splits for a dividend, as the payment rail needs them: pro rata by holdings
-- at call time (the same split `pay_dividend` records).
CREATE OR REPLACE FUNCTION dividend_splits_json(p_dividend UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	SELECT coalesce(jsonb_agg(
		jsonb_build_object('wallet', s.wallet::TEXT, 'amount', s.amount::TEXT)
		ORDER BY s.amount DESC, s.wallet
	), '[]')
	FROM dividends d, pro_rata_split(d.creator_id, d.amount_due, 'HOLDINGS') s
	WHERE d.id = p_dividend
$$;

-- Result of AuditMilestone / ReclaimCallback: the audited proof plus the
-- dividend it created (absent when rejected).
CREATE OR REPLACE FUNCTION audit_result_json(p income_proofs)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'approved', p.status = 'APPROVED',
		'proof', income_proof_json(p),
		'dividend', (
			SELECT dividend_json(d) FROM dividends d WHERE d.proof_id = p.id
		)
	))
$$;

-- ─── instrument view ──────────────────────────────────────────
-- Broker-style quote screen for one creator token: quote, day statistics,
-- pool depth, status, fundamentals, the viewer's position and corporate
-- actions (`creator_market_json`), OHLCV candles (`creator_candles_json`) and
-- the per-user watchlist. Contract: docs/instrument-view.md.

-- ─── watchlists ───────────────────────────────────────────────
-- Creators a user follows. Capped per user (see watchlist_add), so the list
-- is returned whole instead of paged.
CREATE TABLE watchlists(
	user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, creator_id)
);
-- GET /watchlist order (newest first).
CREATE INDEX watchlists_user_created_idx
	ON watchlists(user_id, created_at DESC, creator_id);

-- ─── pool curve quotes ────────────────────────────────────────
-- Same constant-product + 0.3% input-fee math as amm_swap, as pure functions
-- so depth can be quoted without touching the pool. Keep in sync with
-- amm_swap (a test compares them).

-- Tokens received for spending `p_usdc` USDC (BUY).
CREATE OR REPLACE FUNCTION pool_tokens_for_usdc(
	p_usdc_reserve NUMERIC, p_token_reserve NUMERIC, p_usdc NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
	SELECT trunc(
		p_token_reserve * (p_usdc * 0.997)
		/ (p_usdc_reserve + p_usdc * 0.997),
		18
	)
$$;

-- Tokens to sell to receive `p_usdc` USDC (SELL), rounded up so the swap
-- yields at least `p_usdc`. NULL when the pool can't pay that much.
CREATE OR REPLACE FUNCTION pool_tokens_to_receive_usdc(
	p_usdc_reserve NUMERIC, p_token_reserve NUMERIC, p_usdc NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
	SELECT CASE WHEN p_usdc > 0 AND p_usdc < p_usdc_reserve THEN
		-- out = R_u * e / (R_t + e) with e = 0.997 * tokens, so
		-- tokens = out * R_t / ((R_u - out) * 0.997).
		-- The scale-40 cast makes numeric division keep 40 decimals (its default
		-- precision is ~16 significant digits), so rounding up to 18 dp is exact
		-- and the swap never pays out below `p_usdc`. (Multiplying by 1e-18 keeps
		-- all 18 decimals; dividing would round to ~16 significant digits.)
		ceil(
			(p_usdc * p_token_reserve)::NUMERIC(100, 40)
			/ ((p_usdc_reserve - p_usdc) * 0.997)
			* 1000000000000000000
		) * 0.000000000000000001
	END
$$;

-- Depth ladder for the standard sizes. Each level: tokens, average price and
-- signed impact vs the spot price (asks above it, bids below it).
CREATE OR REPLACE FUNCTION pool_depth_json(
	p_usdc_reserve NUMERIC, p_token_reserve NUMERIC
)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
	WITH spot AS (SELECT p_usdc_reserve / p_token_reserve AS price),
	sizes AS (SELECT s FROM unnest(ARRAY[100, 500, 1000, 5000]::NUMERIC[]) AS s),
	asks AS (
		SELECT s, smx.pool_tokens_for_usdc(p_usdc_reserve, p_token_reserve, s) AS tokens
		FROM sizes
	),
	bids AS (
		SELECT s, smx.pool_tokens_to_receive_usdc(p_usdc_reserve, p_token_reserve, s) AS tokens
		FROM sizes
	)
	SELECT jsonb_build_object(
		'bids', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'sizeUsdc', b.s::TEXT,
				'tokens', b.tokens::TEXT,
				'avgPrice', trunc(b.s / b.tokens, 18)::TEXT,
				'impactPct', round((b.s / b.tokens - spot.price) / spot.price * 100, 2)::TEXT
			) ORDER BY b.s)
			FROM bids b, spot WHERE b.tokens > 0
		), '[]'),
		'asks', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'sizeUsdc', a.s::TEXT,
				'tokens', a.tokens::TEXT,
				'avgPrice', trunc(a.s / a.tokens, 18)::TEXT,
				'impactPct', round((a.s / a.tokens - spot.price) / spot.price * 100, 2)::TEXT
			) ORDER BY a.s)
			FROM asks a, spot WHERE a.tokens > 0
		), '[]')
	)
$$;

-- ─── creator_market_json ──────────────────────────────────────

-- The `market` object on GET /creators/{ticker}. `p_wallet` is the viewer's
-- wallet (NULL when signed out, so `position` is null). `p_now` exists so
-- tests can pin the clock.
--
-- Definitions: 24h window is (now - 24h, now]. `open` is the last tick at or
-- before the window start (the first tick for a younger creator), `close` is
-- the pool price. VWAP is USDC volume / token volume. Circulating supply is
-- the sum of holder balances. Average cost is total USDC spent / tokens
-- bought across primary investments and BUY trades (sells leave it
-- unchanged, the weighted-average-cost method).
CREATE OR REPLACE FUNCTION creator_market_json(
	p_creator UUID, p_wallet TEXT DEFAULT NULL, p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH c AS (
		SELECT * FROM creators WHERE id = p_creator
	),
	pl AS (
		SELECT p.usdc_reserve, p.token_reserve FROM pools p
		WHERE p.creator_id = p_creator
	),
	px AS (
		SELECT coalesce((SELECT trunc(usdc_reserve / token_reserve, 18) FROM pl), 0) AS price
	),
	base AS (
		SELECT coalesce(
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator AND t.at <= p_now - interval '24 hours'
				ORDER BY t.at DESC LIMIT 1
			),
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator ORDER BY t.at ASC LIMIT 1
			),
			px.price
		) AS price
		FROM px
	),
	win AS (
		SELECT max(t.price) AS hi, min(t.price) AS lo FROM price_ticks t
		WHERE t.creator_id = p_creator
			AND t.at > p_now - interval '24 hours' AND t.at <= p_now
	),
	ohlc AS (
		SELECT
			base.price AS o,
			greatest(base.price, px.price, win.hi) AS h,
			least(base.price, px.price, win.lo) AS l,
			px.price AS c
		FROM base, px, win
	),
	ever AS (
		SELECT max(t.price) AS hi, min(t.price) AS lo FROM price_ticks t
		WHERE t.creator_id = p_creator AND t.at <= p_now
	),
	tr24 AS (
		SELECT
			coalesce(sum(t.usdc_amount), 0) AS usdc,
			coalesce(sum(t.token_amount), 0) AS tokens,
			count(*) AS n
		FROM trades t
		WHERE t.creator_id = p_creator
			AND t.created_at > p_now - interval '24 hours' AND t.created_at <= p_now
	),
	frozen AS (
		-- The newest freeze/unfreeze event decides.
		SELECT e.kind = 'ESCROW_FROZEN' AS is_frozen, e.payload ->> 'reason' AS reason
		FROM oracle_events e
		WHERE e.creator_id = p_creator
			AND e.kind IN ('ESCROW_FROZEN', 'ESCROW_UNFROZEN')
			AND e.created_at <= p_now
		ORDER BY e.created_at DESC, e.seq DESC LIMIT 1
	),
	st AS (
		SELECT
			CASE
				WHEN c.status = 'DEFAULTED' THEN 'DEFAULTED'
				WHEN c.status = 'COMPLETED' THEN 'COMPLETED'
				WHEN c.status = 'GRACE' THEN 'GRACE'
				WHEN coalesce((SELECT is_frozen FROM frozen), FALSE) THEN 'FROZEN'
				ELSE 'LIVE'
			END AS kind,
			c.status AS raw,
			c.raise_closed_at IS NULL AS raising
		FROM c
	),
	supply AS (
		-- Contract totalSupply: holders plus the pool's tokens.
		SELECT coalesce(sum(h.balance), 0) + coalesce((SELECT token_reserve FROM pl), 0) AS total,
			count(*) FILTER (WHERE h.balance > 0) AS holders
		FROM holdings h WHERE h.creator_id = p_creator
	),
	pos AS (
		-- cost = remaining tokens at the average cost. Multiplying before the
		-- division keeps it exact when nothing was sold.
		SELECT
			h.balance AS tokens,
			coalesce(b.usdc / nullif(b.tokens, 0), px.price) AS avg_cost,
			coalesce(h.balance * b.usdc / nullif(b.tokens, 0), h.balance * px.price)
				AS cost
		FROM holdings h
		CROSS JOIN px
		CROSS JOIN LATERAL (
			SELECT sum(x.usdc) AS usdc, sum(x.tokens) AS tokens FROM (
				SELECT i.usdc_amount AS usdc, i.token_amount AS tokens
				FROM investments i
				WHERE i.creator_id = p_creator AND i.wallet = p_wallet::evm_address
				UNION ALL
				SELECT t.usdc_amount, t.token_amount FROM trades t
				WHERE t.creator_id = p_creator AND t.wallet = p_wallet::evm_address
					AND t.side = 'BUY' AND t.created_at <= p_now
			) x
		) b
		WHERE h.creator_id = p_creator AND h.wallet = p_wallet::evm_address
			AND h.balance > 0
	)
	SELECT jsonb_build_object(
		'quote', jsonb_build_object(
			'price', px.price::TEXT,
			'change24h', (px.price - base.price)::TEXT,
			'changePct24h', coalesce(
				round((px.price - base.price) / nullif(base.price, 0) * 100, 2), 0
			)::TEXT
		),
		'ohlc24h', jsonb_build_object(
			'open', ohlc.o::TEXT, 'high', ohlc.h::TEXT,
			'low', ohlc.l::TEXT, 'close', ohlc.c::TEXT
		),
		'dayRange', jsonb_build_object('low', ohlc.l::TEXT, 'high', ohlc.h::TEXT),
		'sinceIpoRange', jsonb_build_object(
			'low', least(ever.lo, px.price)::TEXT,
			'high', greatest(ever.hi, px.price)::TEXT
		),
		'volume24h', tr24.usdc::TEXT,
		'vwap24h', trunc(tr24.usdc / nullif(tr24.tokens, 0), 18)::TEXT,
		'trades24h', tr24.n,
		'pool', jsonb_build_object(
			'usdcReserve', coalesce((SELECT usdc_reserve FROM pl), 0)::TEXT,
			'tokenReserve', coalesce((SELECT token_reserve FROM pl), 0)::TEXT,
			'feeBps', 30
		),
		'depth', coalesce(
			(SELECT pool_depth_json(pl.usdc_reserve, pl.token_reserve) FROM pl),
			'{"bids":[],"asks":[]}'
		),
		'status', jsonb_build_object(
			'kind', st.kind,
			'label', CASE st.kind
				WHEN 'LIVE' THEN CASE
					WHEN st.raw = 'DRAFT' THEN 'Not yet listed'
					WHEN st.raising THEN 'Raise open: trading starts when it closes'
					ELSE 'Live' END
				WHEN 'GRACE' THEN 'Grace period: proof overdue'
				WHEN 'FROZEN' THEN 'Escrow frozen: '
					|| coalesce((SELECT reason FROM frozen), 'proof overdue')
				WHEN 'DEFAULTED' THEN 'Defaulted: trading closed'
				ELSE 'Term ended: sell only'
			END,
			-- COMPLETED stays open for SELL only (amm_swap rejects BUY).
			'tradingHalted', st.raw <> 'COMPLETED' AND (
				st.raw <> 'LIVE' OR st.raising
				OR coalesce((SELECT is_frozen FROM frozen), FALSE)
			)
		),
		'fundamentals', jsonb_build_object(
			'marketCap', trunc(px.price * supply.total, 6)::TEXT,
			'supply', supply.total::TEXT,
			'shareBps', c.share_bps,
			'termMonths', c.term_months,
			'termLeftMonths', CASE
				WHEN c.raise_closed_at IS NULL THEN c.term_months
				ELSE greatest(0, c.term_months - (
					extract(year FROM age(p_now, c.raise_closed_at)) * 12
					+ extract(month FROM age(p_now, c.raise_closed_at))
				)::INTEGER)
			END,
			'verifiedIncomeTotal', (
				SELECT coalesce(sum(ip.verified_amount), 0)::TEXT FROM income_proofs ip
				WHERE ip.creator_id = p_creator AND ip.status = 'APPROVED'
			),
			'dividendsPaidTotal', (
				SELECT coalesce(sum(d.amount_due), 0)::TEXT FROM dividends d
				WHERE d.creator_id = p_creator AND d.status = 'PAID'
			),
			'nextProofDueAt', c.next_proof_due_at,
			'holders', supply.holders
		),
		'position', (
			SELECT jsonb_build_object(
				'tokens', pos.tokens::TEXT,
				'avgCost', pos.avg_cost::TEXT,
				'value', trunc(pos.tokens * px.price, 6)::TEXT,
				'pnl', trunc(pos.tokens * px.price - pos.cost, 6)::TEXT,
				'pnlPct', coalesce(
					round((pos.tokens * px.price - pos.cost) / nullif(pos.cost, 0) * 100, 2), 0
				)::TEXT
			)
			FROM pos
		),
		'corporateActions', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'at', e.created_at,
				'kind', e.kind,
				'label', CASE e.kind
					WHEN 'IPO' THEN 'IPO launched'
					WHEN 'PROOF_VERIFIED' THEN 'Income proof verified (period '
						|| (e.payload ->> 'period') || ')'
					WHEN 'PROOF_REJECTED' THEN 'Income proof rejected'
						|| coalesce(': ' || (e.payload ->> 'reason'), '')
					WHEN 'TRANCHE_RELEASED' THEN 'Escrow tranche '
						|| (e.payload ->> 'idx') || ' released'
					WHEN 'DIVIDEND_PAID' THEN 'Dividend paid'
					WHEN 'ESCROW_FROZEN' THEN 'Escrow frozen'
						|| coalesce(': ' || (e.payload ->> 'reason'), '')
					WHEN 'ESCROW_UNFROZEN' THEN 'Escrow unfrozen'
					WHEN 'CREATOR_UPDATE' THEN 'Creator update: '
						|| (e.payload ->> 'body')
					ELSE 'Defaulted: holders refunded'
				END,
				'amount', CASE e.kind
					WHEN 'IPO' THEN e.payload ->> 'targetRaise'
					WHEN 'DEFAULTED' THEN e.payload ->> 'refundTotal'
					ELSE e.payload ->> 'amount'
				END
			) ORDER BY e.created_at DESC, e.seq DESC)
			FROM (
				SELECT x.* FROM oracle_events x
				WHERE x.creator_id = p_creator
					AND x.kind IN (
						'IPO', 'PROOF_VERIFIED', 'PROOF_REJECTED', 'TRANCHE_RELEASED',
						'DIVIDEND_PAID', 'ESCROW_FROZEN', 'ESCROW_UNFROZEN', 'DEFAULTED',
						'CREATOR_UPDATE'
					)
					AND x.created_at <= p_now
				ORDER BY x.created_at DESC, x.seq DESC LIMIT 50
			) e
		), '[]')
	)
	FROM c, px, base, ohlc, ever, tr24, st, supply
$$;

-- ─── creator_candles_json ─────────────────────────────────────

-- OHLCV candles for GET /creators/{ticker}/candles. `p_interval` is the
-- visible range; the bucket size follows from it:
--   1H  -> 1 minute buckets, last 60 candles
--   1D  -> 1 hour buckets,   last 24 candles
--   1W  -> 4 hour buckets,   last 42 candles
--   ALL -> whole life, bucket = span / 198 rounded up to whole minutes
--          (at least 1 minute), so never more than 200 candles
-- Buckets align to the UTC epoch and run up to the current (partial) bucket.
-- OHLC come from price_ticks, volume (USDC) from trades. A bucket without
-- ticks is flat at the previous close with zero volume; buckets before the
-- first tick are omitted. Each open is the previous close for a continuous
-- chart. `p_now` pins the clock in tests.
CREATE OR REPLACE FUNCTION creator_candles_json(
	p_creator UUID, p_interval TEXT, p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH first_tick AS (
		SELECT min(t.at) AS at FROM price_ticks t
		WHERE t.creator_id = p_creator AND t.at <= p_now
	),
	cfg AS (
		SELECT
			CASE p_interval
				WHEN '1H' THEN interval '1 minute'
				WHEN '1D' THEN interval '1 hour'
				WHEN '1W' THEN interval '4 hours'
				ELSE make_interval(secs := greatest(60, ceil(
					extract(epoch FROM p_now - coalesce(f.at, p_now)) / 198 / 60
				) * 60)::DOUBLE PRECISION)
			END AS b,
			CASE p_interval WHEN '1H' THEN 60 WHEN '1D' THEN 24
				WHEN '1W' THEN 42 ELSE 200 END AS n,
			f.at AS first_at
		FROM first_tick f
		WHERE p_interval IN ('1H', '1D', '1W', 'ALL')
	),
	bounds AS (
		SELECT cfg.b,
			greatest(
				date_bin(cfg.b, cfg.first_at, TIMESTAMPTZ 'epoch'),
				date_bin(cfg.b, p_now, TIMESTAMPTZ 'epoch') - (cfg.n - 1) * cfg.b
			) AS start_at,
			date_bin(cfg.b, p_now, TIMESTAMPTZ 'epoch') AS end_at
		FROM cfg WHERE cfg.first_at IS NOT NULL
	),
	series AS (
		SELECT bo.b, g.bk
		FROM bounds bo, generate_series(bo.start_at, bo.end_at, bo.b) AS g(bk)
	),
	tk AS (
		SELECT date_bin(bo.b, t.at, TIMESTAMPTZ 'epoch') AS bk,
			(array_agg(t.price ORDER BY t.at, t.id))[1] AS o,
			(array_agg(t.price ORDER BY t.at DESC, t.id DESC))[1] AS c,
			max(t.price) AS h, min(t.price) AS l
		FROM bounds bo
		JOIN price_ticks t ON t.creator_id = p_creator
			AND t.at >= bo.start_at AND t.at <= p_now
		GROUP BY 1
	),
	vol AS (
		SELECT date_bin(bo.b, t.created_at, TIMESTAMPTZ 'epoch') AS bk,
			sum(t.usdc_amount) AS v
		FROM bounds bo
		JOIN trades t ON t.creator_id = p_creator
			AND t.created_at >= bo.start_at AND t.created_at <= p_now
		GROUP BY 1
	),
	pre AS (
		SELECT t.price FROM bounds bo
		JOIN price_ticks t ON t.creator_id = p_creator AND t.at < bo.start_at
		ORDER BY t.at DESC, t.id DESC LIMIT 1
	),
	-- Forward-fill the close: `grp` bumps at every bucket that has ticks.
	grouped AS (
		SELECT s.bk, tk.o, tk.h, tk.l, tk.c, coalesce(vol.v, 0) AS v,
			count(tk.c) OVER (ORDER BY s.bk) AS grp
		FROM series s
		LEFT JOIN tk ON tk.bk = s.bk
		LEFT JOIN vol ON vol.bk = s.bk
	),
	filled AS (
		SELECT g.*,
			coalesce(
				first_value(g.c) OVER (PARTITION BY g.grp ORDER BY g.bk),
				(SELECT price FROM pre)
			) AS close
		FROM grouped g
	),
	candles AS (
		SELECT f.bk, f.v, f.close,
			coalesce(lag(f.close) OVER (ORDER BY f.bk), f.o) AS open,
			f.h, f.l
		FROM filled f
	)
	SELECT jsonb_build_object('items', coalesce((
		SELECT jsonb_agg(jsonb_build_object(
			't', c.bk,
			'o', c.open::TEXT,
			'h', greatest(c.open, c.h, c.close)::TEXT,
			'l', least(c.open, c.l, c.close)::TEXT,
			'c', c.close::TEXT,
			'v', c.v::TEXT
		) ORDER BY c.bk)
		FROM candles c WHERE c.close IS NOT NULL
	), '[]'))
$$;

-- ─── watchlist functions ──────────────────────────────────────

-- One watchlist row as the drawer shows it: the creator summary (price, 24h
-- change, sparkline) plus when it was added.
CREATE OR REPLACE FUNCTION watchlist_item_json(c creators, p_added TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	SELECT creator_summary_json(c) || jsonb_build_object('addedAt', p_added)
$$;

-- GET /watchlist: the user's creators, newest first (capped at 100 rows).
CREATE OR REPLACE FUNCTION watchlist_json(p_user UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	SELECT jsonb_build_object('items', coalesce((
		SELECT jsonb_agg(
			watchlist_item_json(c, w.created_at) ORDER BY w.created_at DESC, c.id
		)
		FROM watchlists w
		JOIN creators c ON c.id = w.creator_id
		WHERE w.user_id = p_user
	), '[]'))
$$;

-- PUT /watchlist/{ticker}: idempotent add; 404 for an unknown ticker, 409
-- once the user holds 100 creators.
CREATE OR REPLACE FUNCTION watchlist_add(p_user UUID, p_ticker TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator UUID := creator_id_by_ticker(p_ticker);
	v_added TIMESTAMPTZ;
BEGIN
	SELECT w.created_at INTO v_added FROM watchlists w
	WHERE w.user_id = p_user AND w.creator_id = v_creator;
	IF v_added IS NULL THEN
		PERFORM assert_that(
			(SELECT count(*) FROM watchlists w WHERE w.user_id = p_user) < 100,
			409, 'Watchlist is full (100 creators)'
		);
		INSERT INTO watchlists(user_id, creator_id) VALUES (p_user, v_creator)
		RETURNING created_at INTO v_added;
	END IF;
	RETURN (
		SELECT watchlist_item_json(c, v_added) FROM creators c WHERE c.id = v_creator
	);
END;
$$;

-- DELETE /watchlist/{ticker}: idempotent remove; 404 for an unknown ticker.
CREATE OR REPLACE FUNCTION watchlist_remove(p_user UUID, p_ticker TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_removed INTEGER;
BEGIN
	DELETE FROM watchlists w
	WHERE w.user_id = p_user AND w.creator_id = creator_id_by_ticker(p_ticker);
	GET DIAGNOSTICS v_removed = ROW_COUNT;
	RETURN v_removed > 0;
END;
$$;

-- ─── page documents ───────────────────────────────────────────

-- GET /events replay: the newest `p_limit` events after cursor `p_since`
-- (optionally one creator's), oldest first so the stream replays in order. If
-- more than `p_limit` were missed, the oldest are dropped.
CREATE OR REPLACE FUNCTION oracle_events_since(
	p_since   BIGINT,
	p_creator UUID,
	p_limit   INTEGER
)
RETURNS SETOF oracle_events
LANGUAGE sql
STABLE
SET search_path = smx, public
AS $$
	SELECT r.* FROM (
		SELECT e.* FROM oracle_events e
		WHERE e.seq > p_since AND (p_creator IS NULL OR e.creator_id = p_creator)
		ORDER BY e.seq DESC
		LIMIT least(greatest(p_limit, 0), 200)
	) r
	ORDER BY r.seq
$$;

-- GET / : exchange-wide totals (all creators), trending creators (live ones
-- first, then by 24h volume) and the latest oracle events.
CREATE OR REPLACE FUNCTION exchange_json(p_limit INTEGER)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_build_object(
		'totals', jsonb_build_object(
			'totalRaised', (
				SELECT coalesce(sum(c.raised_amount), 0)::TEXT
				FROM creators c WHERE c.status <> 'DRAFT'
			),
			'activeCreators', (
				SELECT count(*) FROM creators c WHERE c.status IN ('LIVE', 'GRACE')
			),
			'dividendsPaid', (
				SELECT coalesce(sum(d.amount_due), 0)::TEXT
				FROM dividends d WHERE d.status = 'PAID'
			),
			'holders', (
				SELECT count(DISTINCT h.wallet) FROM holdings h WHERE h.balance > 0
			)
		),
		'trending', (
			SELECT coalesce(jsonb_agg(creator_summary_json(t.c) ORDER BY t.rank), '[]')
			FROM (
				SELECT c, row_number() OVER (
					ORDER BY (c.status IN ('LIVE', 'GRACE')) DESC,
						(SELECT coalesce(sum(tr.usdc_amount), 0) FROM trades tr
							WHERE tr.creator_id = c.id
								AND tr.created_at > now() - interval '24 hours') DESC,
						c.raised_amount DESC, c.ticker
				) AS rank
				FROM creators c WHERE c.status <> 'DRAFT'
			) t
			WHERE t.rank <= p_limit
		),
		'events', (
			SELECT coalesce(jsonb_agg(oracle_event_json(e) ORDER BY e.created_at DESC, e.id), '[]')
			FROM oracle_events e
			WHERE e.id IN (SELECT y.id FROM oracle_events y  ORDER BY created_at DESC, id LIMIT 20)
		),
		-- "View all" flags: true when the full pages hold more than the widgets.
		'hasMoreTrending', (
			SELECT count(*) > p_limit FROM creators c WHERE c.status <> 'DRAFT'
		),
		'hasMoreEvents', (SELECT count(*) > 20 FROM (SELECT 1 FROM oracle_events LIMIT 21) y)
	)
$$;

-- GET /creators/{ticker} : NULL when the ticker doesn't exist (route 404s).
CREATE OR REPLACE FUNCTION creator_page_json(p_ticker TEXT, p_wallet TEXT)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'creator', creator_json(c),
		'chart', price_points_json(c.id, 500),
		'holders', (
			SELECT coalesce(jsonb_agg(holding_json(h) ORDER BY h.balance DESC, h.wallet), '[]')
			FROM holdings h
			WHERE (ROW(h.creator_id, h.wallet)) IN (SELECT y.creator_id, y.wallet FROM holdings y WHERE y.creator_id = c.id AND y.balance > 0 ORDER BY y.balance DESC, y.wallet LIMIT 20)
		),
		'trades', (
			SELECT coalesce(jsonb_agg(trade_json(t) ORDER BY t.created_at DESC, t.id), '[]')
			FROM trades t
			WHERE t.id IN (SELECT y.id FROM trades y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 20)
		),
		'events', (
			SELECT coalesce(jsonb_agg(oracle_event_json(e) ORDER BY e.created_at DESC, e.id), '[]')
			FROM oracle_events e
			WHERE e.id IN (SELECT y.id FROM oracle_events y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 20)
		),
		'proofs', (
			SELECT coalesce(jsonb_agg(income_proof_json(p) ORDER BY p.created_at DESC, p.id), '[]')
			FROM income_proofs p
			WHERE p.id IN (SELECT y.id FROM income_proofs y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
		),
		'dividends', (
			SELECT coalesce(jsonb_agg(dividend_json(d) ORDER BY d.created_at DESC, d.id), '[]')
			FROM dividends d
			WHERE d.id IN (SELECT y.id FROM dividends y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
		),
		'updates', (
			SELECT coalesce(jsonb_agg(creator_update_json(u) ORDER BY u.created_at DESC, u.id), '[]')
			FROM creator_updates u
			WHERE u.id IN (SELECT y.id FROM creator_updates y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 5)
		),
		-- "View all" flags: true when the full list holds more than shown here.
		'more', jsonb_build_object(
			'updates', (SELECT count(*) > 5 FROM (SELECT 1 FROM creator_updates y WHERE y.creator_id = c.id LIMIT 6) y),
			'holders', (SELECT count(*) > 20 FROM (SELECT 1 FROM holdings y WHERE y.creator_id = c.id AND y.balance > 0 LIMIT 21) y),
			'trades', (SELECT count(*) > 20 FROM (SELECT 1 FROM trades y WHERE y.creator_id = c.id LIMIT 21) y),
			'events', (SELECT count(*) > 20 FROM (SELECT 1 FROM oracle_events y WHERE y.creator_id = c.id LIMIT 21) y),
			'proofs', (SELECT count(*) > 10 FROM (SELECT 1 FROM income_proofs y WHERE y.creator_id = c.id LIMIT 11) y),
			'dividends', (SELECT count(*) > 10 FROM (SELECT 1 FROM dividends y WHERE y.creator_id = c.id LIMIT 11) y)
		),
		'viewer', jsonb_build_object(
			'wallet', p_wallet,
			'holding', (
				SELECT holding_json(h) FROM holdings h
				WHERE h.creator_id = c.id AND h.wallet = p_wallet::evm_address
			)
		)
	)) || jsonb_build_object('market', creator_market_json(c.id, p_wallet))
	FROM creators c WHERE c.ticker = p_ticker
$$;

-- GET /hub : the viewer's own creator dashboard. `creator` is absent for a
-- viewer who hasn't launched, so the page can offer the launch CTA.
CREATE OR REPLACE FUNCTION creator_hub_json(p_user UUID)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT coalesce((
		SELECT jsonb_strip_nulls(jsonb_build_object(
			'creator', creator_json(c),
			'pendingDividend', (
				SELECT dividend_json(d) FROM dividends d
				WHERE d.creator_id = c.id AND d.status = 'DUE'
				ORDER BY d.created_at LIMIT 1
			),
			'dividends', (
				SELECT coalesce(jsonb_agg(dividend_json(d) ORDER BY d.created_at DESC, d.id), '[]')
				FROM dividends d
			WHERE d.id IN (SELECT y.id FROM dividends y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
			),
			'proofs', (
				SELECT coalesce(jsonb_agg(income_proof_json(p) ORDER BY p.created_at DESC, p.id), '[]')
				FROM income_proofs p
			WHERE p.id IN (SELECT y.id FROM income_proofs y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
			),
			'chainJobs', (
				SELECT coalesce(jsonb_agg(chain_job_json(j) ORDER BY j.seq DESC), '[]')
				FROM chain_jobs j
			WHERE j.id IN (SELECT y.id FROM chain_jobs y WHERE y.creator_id = c.id ORDER BY y.seq DESC LIMIT 10)
			),
			'more', jsonb_build_object(
				'proofs', (SELECT count(*) > 10 FROM (SELECT 1 FROM income_proofs y WHERE y.creator_id = c.id LIMIT 11) y),
				'dividends', (SELECT count(*) > 10 FROM (SELECT 1 FROM dividends y WHERE y.creator_id = c.id LIMIT 11) y),
				'events', (SELECT count(*) > 0 FROM (SELECT 1 FROM oracle_events y WHERE y.creator_id = c.id LIMIT 1) y)
			),
			-- Posts left in the rolling 24-hour limit of `post_creator_update`.
			'holderCount', (
				SELECT count(*) FROM holdings h
				WHERE h.creator_id = c.id AND h.balance > 0
			)::INTEGER,
			'updatesLeft', greatest(0, 5 - (
				SELECT count(*) FROM creator_updates y
				WHERE y.creator_id = c.id AND y.created_at > now() - interval '24 hours'
			))::INTEGER,
			'collateral', jsonb_build_object(
				'stakeAmount', c.stake_amount::TEXT,
				'atRisk', c.status IN ('LIVE', 'GRACE')
			)
		))
		FROM creators c WHERE c.owner_user_id = p_user
	), '{}'::JSONB)
$$;

-- ─── paginated list pages ─────────────────────────────────────
-- Keyset pages for the "View all" screens. Every function fetches
-- `p_limit + 1` rows: the extra row only says there is a next page. They
-- return `items` plus `next` ({key, id} of the last item, or null on the last
-- page). The route turns `next` into the opaque `nextPageCursor`, and passes
-- the decoded cursor back as `p_after_key` / `p_after_id`.

-- GET /creators : every non-draft creator. Sorts: `trending` (live first, then
-- 24h volume, then raised, then ticker), `newest`, `raised`. `p_status` is
-- live | grace | defaulted (or NULL). `p_q` matches ticker or name.
-- Trending keys on the 24h volume, which drifts as trades age out, so a page
-- boundary can shift slightly between requests.
CREATE OR REPLACE FUNCTION creators_page_json(
	p_sort      TEXT,
	p_status    TEXT,
	p_q         TEXT,
	p_after_key TEXT,
	p_after_id  TEXT,
	p_limit     INTEGER
)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	WITH base AS (
		SELECT c,
			(c.status IN ('LIVE', 'GRACE'))::INTEGER AS active,
			CASE WHEN p_sort = 'trending' THEN (
				SELECT coalesce(sum(tr.usdc_amount), 0) FROM trades tr
				WHERE tr.creator_id = c.id
					AND tr.created_at > now() - interval '24 hours'
			) ELSE 0 END AS vol
		FROM creators c
		WHERE c.status <> 'DRAFT'
			AND (p_status IS NULL OR c.status = upper(p_status)::creator_status)
			AND (
				coalesce(p_q, '') = '' OR (
					c.ticker ILIKE '%' || replace(replace(replace(
						p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
					OR c.display_name ILIKE '%' || replace(replace(replace(
						p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
				)
			)
	),
	page AS (
		SELECT b.c,
			CASE p_sort
				WHEN 'newest' THEN (b.c).created_at::TEXT
				WHEN 'raised' THEN (b.c).raised_amount::TEXT
				ELSE b.active || '|' || b.vol || '|' || (b.c).raised_amount
			END AS k,
			CASE p_sort WHEN 'newest' THEN (b.c).id::TEXT ELSE (b.c).ticker END AS i,
			row_number() OVER (ORDER BY
				CASE WHEN p_sort NOT IN ('newest', 'raised') THEN b.active END DESC,
				CASE WHEN p_sort NOT IN ('newest', 'raised') THEN b.vol END DESC,
				CASE WHEN p_sort = 'newest' THEN (b.c).created_at END DESC,
				CASE WHEN p_sort = 'newest' THEN (b.c).id END DESC,
				CASE WHEN p_sort <> 'newest' THEN (b.c).raised_amount END DESC,
				(b.c).ticker
			) AS n
		FROM base b
		WHERE p_after_key IS NULL OR CASE p_sort
			WHEN 'newest' THEN
				((b.c).created_at, (b.c).id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			WHEN 'raised' THEN
				(b.c).raised_amount < p_after_key::NUMERIC
				OR ((b.c).raised_amount = p_after_key::NUMERIC
					AND (b.c).ticker > p_after_id)
			ELSE
				(b.active, b.vol, (b.c).raised_amount) < (
					split_part(p_after_key, '|', 1)::INTEGER,
					split_part(p_after_key, '|', 2)::NUMERIC,
					split_part(p_after_key, '|', 3)::NUMERIC
				)
				OR (
					(b.active, b.vol, (b.c).raised_amount) = (
						split_part(p_after_key, '|', 1)::INTEGER,
						split_part(p_after_key, '|', 2)::NUMERIC,
						split_part(p_after_key, '|', 3)::NUMERIC
					) AND (b.c).ticker > p_after_id
				)
		END
		ORDER BY n
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'items', coalesce((
			SELECT jsonb_agg(creator_summary_json(p.c) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;

-- GET /activity : the oracle event feed, newest first (by `seq`), optionally
-- one kind and/or one ticker. An unknown ticker yields an empty page.
CREATE OR REPLACE FUNCTION activity_page_json(
	p_kind      TEXT,
	p_ticker    TEXT,
	p_after_key TEXT,
	p_after_id  TEXT,
	p_limit     INTEGER
)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	WITH page AS (
		SELECT e, e.seq::TEXT AS k, e.id::TEXT AS i,
			row_number() OVER (ORDER BY e.seq DESC) AS n
		FROM oracle_events e
		WHERE (p_after_key IS NULL OR e.seq < p_after_key::BIGINT)
			AND (p_kind IS NULL OR e.kind = p_kind::oracle_event_kind)
			AND (
				p_ticker IS NULL OR e.creator_id IN (
					SELECT c.id FROM creators c WHERE c.ticker = p_ticker
				)
			)
		ORDER BY e.seq DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'items', coalesce((
			SELECT jsonb_agg(oracle_event_json(p.e) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;

-- GET /creators/{ticker}/holders : holders with a balance, largest first.
-- Raises 404 for an unknown ticker.
CREATE OR REPLACE FUNCTION creator_holders_page_json(
	p_ticker TEXT, p_after_key TEXT, p_after_id TEXT, p_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT h, h.balance::TEXT AS k, h.wallet::TEXT AS i,
			row_number() OVER (ORDER BY h.balance DESC, h.wallet) AS n
		FROM holdings h
		WHERE h.creator_id = (SELECT id FROM cr) AND h.balance > 0
			AND (
				p_after_key IS NULL OR h.balance < p_after_key::NUMERIC
				OR (h.balance = p_after_key::NUMERIC AND h.wallet::TEXT > p_after_id)
			)
		ORDER BY h.balance DESC, h.wallet
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(holding_json(p.h) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;

-- GET /creators/{ticker}/trades : newest first. Raises 404 for an unknown ticker.
CREATE OR REPLACE FUNCTION creator_trades_page_json(
	p_ticker TEXT, p_after_key TEXT, p_after_id TEXT, p_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT t, t.created_at::TEXT AS k, t.id::TEXT AS i,
			row_number() OVER (ORDER BY t.created_at DESC, t.id DESC) AS n
		FROM trades t
		WHERE t.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (t.created_at, t.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY t.created_at DESC, t.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(trade_json(p.t) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;

-- GET /creators/{ticker}/proofs : newest first. Raises 404 for an unknown ticker.
CREATE OR REPLACE FUNCTION creator_proofs_page_json(
	p_ticker TEXT, p_after_key TEXT, p_after_id TEXT, p_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT x, x.created_at::TEXT AS k, x.id::TEXT AS i,
			row_number() OVER (ORDER BY x.created_at DESC, x.id DESC) AS n
		FROM income_proofs x
		WHERE x.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (x.created_at, x.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY x.created_at DESC, x.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(income_proof_json(p.x) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;

-- GET /creators/{ticker}/updates : newest first. Raises 404 for an unknown
-- ticker.
CREATE OR REPLACE FUNCTION creator_updates_page_json(
	p_ticker TEXT, p_after_key TEXT, p_after_id TEXT, p_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT x, x.created_at::TEXT AS k, x.id::TEXT AS i,
			row_number() OVER (ORDER BY x.created_at DESC, x.id DESC) AS n
		FROM creator_updates x
		WHERE x.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (x.created_at, x.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY x.created_at DESC, x.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(creator_update_json(p.x) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;

-- GET /creators/{ticker}/dividends : newest first. Raises 404 for an unknown
-- ticker.
CREATE OR REPLACE FUNCTION creator_dividends_page_json(
	p_ticker TEXT, p_after_key TEXT, p_after_id TEXT, p_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT d, d.created_at::TEXT AS k, d.id::TEXT AS i,
			row_number() OVER (ORDER BY d.created_at DESC, d.id DESC) AS n
		FROM dividends d
		WHERE d.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (d.created_at, d.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY d.created_at DESC, d.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(dividend_json(p.d) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;

-- ─── portfolio (BEGIN) ────────────────────────────────────────
-- Read-only functions behind GET /portfolio. Appended as one block; the
-- migration `portfolio` ships exactly these.

-- A wallet's portfolio. Position math is NOT repeated here: each holding's
-- tokens, average cost, value and P&L come from `creator_market_json(...)
-- -> position`, so this page and the token page always agree. Cost is the
-- position value minus its P&L. Totals sum the rows. Dividends are the
-- wallet's DIVIDEND payouts (latest 25 plus the lifetime total). `creator` is
-- the user's own IPO, if any.
CREATE OR REPLACE FUNCTION wallet_portfolio_json(p_wallet TEXT, p_user UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH h AS (
		SELECT c.id, c.ticker, c.display_name, creator_market_json(c.id, p_wallet) AS m
		FROM holdings hd
		JOIN creators c ON c.id = hd.creator_id
		WHERE hd.wallet = p_wallet::evm_address AND hd.balance > 0
	),
	pos AS (
		SELECT h.id, h.ticker, h.display_name,
			(h.m -> 'position' ->> 'tokens')::NUMERIC AS tokens,
			(h.m -> 'position' ->> 'avgCost')::NUMERIC AS avg_cost,
			(h.m -> 'quote' ->> 'price')::NUMERIC AS price,
			(h.m -> 'position' ->> 'value')::NUMERIC AS value,
			(h.m -> 'position' ->> 'pnl')::NUMERIC AS pnl,
			(h.m -> 'position' ->> 'pnlPct')::NUMERIC AS pnl_pct,
			h.m -> 'status' ->> 'kind' AS status_kind,
			h.m -> 'status' ->> 'label' AS status_label
		FROM h
		WHERE h.m -> 'position' IS NOT NULL AND h.m -> 'position' <> 'null'::JSONB
	),
	tot AS (
		SELECT coalesce(sum(value - pnl), 0) AS invested,
			coalesce(sum(value), 0) AS value,
			coalesce(sum(pnl), 0) AS pnl
		FROM pos
	),
	dv AS (
		SELECT po.id, po.amount, po.created_at, d.id AS dividend_id,
			d.paid_tx_hash, c.id AS creator_id, c.ticker, c.display_name
		FROM payouts po
		JOIN dividends d ON d.id = po.dividend_id
		JOIN creators c ON c.id = po.creator_id
		WHERE po.wallet = p_wallet::evm_address AND po.kind = 'DIVIDEND'
	)
	SELECT jsonb_build_object(
		'wallet', p_wallet,
		'totals', (
			SELECT jsonb_build_object(
				'invested', tot.invested::TEXT,
				'value', tot.value::TEXT,
				'pnl', tot.pnl::TEXT,
				'pnlPct', coalesce(
					round(tot.pnl / nullif(tot.invested, 0) * 100, 2), 0
				)::TEXT
			) FROM tot
		),
		'holdings', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'creatorId', p.id,
				'ticker', p.ticker,
				'displayName', p.display_name,
				'tokens', p.tokens::TEXT,
				'avgCost', p.avg_cost::TEXT,
				'price', p.price::TEXT,
				'value', p.value::TEXT,
				'pnl', p.pnl::TEXT,
				'pnlPct', p.pnl_pct::TEXT,
				'status', p.status_kind,
				'statusLabel', p.status_label
			) ORDER BY p.value DESC, p.ticker)
			FROM pos p
		), '[]'),
		'dividends', jsonb_build_object(
			'total', (SELECT coalesce(sum(amount), 0) FROM dv)::TEXT,
			'count', (SELECT count(*) FROM dv),
			'items', coalesce((
				SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
					'id', x.id,
					'dividendId', x.dividend_id,
					'creatorId', x.creator_id,
					'ticker', x.ticker,
					'displayName', x.display_name,
					'amount', x.amount::TEXT,
					'txHash', x.paid_tx_hash,
					'createdAt', x.created_at
				)) ORDER BY x.created_at DESC, x.id DESC)
				FROM (
					SELECT * FROM dv ORDER BY created_at DESC, id DESC LIMIT 25
				) x
			), '[]')
		),
		'creator', (
			SELECT jsonb_build_object(
				'ticker', c.ticker, 'displayName', c.display_name, 'status', c.status
			)
			FROM creators c WHERE c.owner_user_id = p_user
		)
	)
$$;

-- GET /portfolio transactions: a wallet's primary investments and AMM trades,
-- newest first, keyset on (created_at, id). `type` is INVESTMENT, BUY or SELL.
-- Investments price at USDC / tokens (1.0 at the IPO).
CREATE OR REPLACE FUNCTION wallet_transactions_json(
	p_wallet TEXT, p_after_key TEXT, p_after_id TEXT, p_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH tx AS (
		SELECT i.id, i.creator_id, 'INVESTMENT' AS type, i.usdc_amount,
			i.token_amount, trunc(i.usdc_amount / nullif(i.token_amount, 0), 18) AS price,
			i.tx_hash::TEXT AS tx_hash, i.created_at
		FROM investments i WHERE i.wallet = p_wallet::evm_address
		UNION ALL
		SELECT t.id, t.creator_id, t.side::TEXT, t.usdc_amount, t.token_amount,
			t.price, t.tx_hash::TEXT, t.created_at
		FROM trades t WHERE t.wallet = p_wallet::evm_address
	),
	page AS (
		SELECT tx.*, c.ticker, c.display_name,
			tx.created_at::TEXT AS k, tx.id::TEXT AS i,
			row_number() OVER (ORDER BY tx.created_at DESC, tx.id DESC) AS n
		FROM tx
		JOIN creators c ON c.id = tx.creator_id
		WHERE p_after_key IS NULL
			OR (tx.created_at, tx.id)
				< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
		ORDER BY tx.created_at DESC, tx.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'items', coalesce((
			SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
				'id', p.id,
				'type', p.type,
				'creatorId', p.creator_id,
				'ticker', p.ticker,
				'displayName', p.display_name,
				'tokenAmount', p.token_amount::TEXT,
				'usdcAmount', p.usdc_amount::TEXT,
				'price', p.price::TEXT,
				'txHash', p.tx_hash,
				'createdAt', p.created_at
			)) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;
-- ─── portfolio (END) ──────────────────────────────────────────

-- ─── onchain ingest (BEGIN) ───────────────────────────────────
-- Live chain mode: users sign swaps and investments, the server verifies the
-- receipt and these functions record the exact event amounts. The chain is the
-- truth; SQL is the index. Appended as one block; the migration
-- `onchain_ingest` ships exactly this.

-- Address of the creator's CreatorPool clone (factory `poolOf`). NULL for
-- creators launched before the AMM or in simulated chain mode.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS pool_address evm_address;

-- One user transaction records one trade or one investment.
CREATE UNIQUE INDEX IF NOT EXISTS trades_tx_hash_uidx
	ON trades(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS investments_tx_hash_uidx
	ON investments(tx_hash) WHERE tx_hash IS NOT NULL;

-- Stores the pool address a settled `createISA` job deployed.
CREATE OR REPLACE FUNCTION set_chain_job_pool(p_job UUID, p_pool evm_address)
RETURNS UUID
LANGUAGE sql
SET search_path = smx, public
AS $$
	UPDATE creators SET pool_address = p_pool
	WHERE id = (SELECT j.creator_id FROM chain_jobs j WHERE j.id = p_job)
	RETURNING id
$$;

-- Records a CreatorPool `Swap` event. Amounts are base units (USDC 6 dp,
-- token 18 dp) exactly as in the event, and so are the post-swap reserves,
-- which replace the pool row. BUY has `p_token_out > 0`, SELL `p_usdc_out > 0`.
-- Idempotent on the transaction hash: a replay returns the stored trade.
CREATE OR REPLACE FUNCTION ingest_onchain_swap(
	p_creator UUID,
	p_trader evm_address,
	p_tx_hash tx_hash,
	p_usdc_in NUMERIC,
	p_token_in NUMERIC,
	p_usdc_out NUMERIC,
	p_token_out NUMERIC,
	p_usdc_reserve NUMERIC,
	p_token_reserve NUMERIC
)
RETURNS trades
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_trade trades;
	v_buy BOOLEAN := p_token_out > 0;
	v_usdc NUMERIC := greatest(p_usdc_in, p_usdc_out) * 1e-6;
	v_tokens NUMERIC := greatest(p_token_in, p_token_out) * 1e-18;
BEGIN
	PERFORM assert_that(
		(v_buy AND p_usdc_in > 0 AND p_token_in = 0 AND p_usdc_out = 0)
			OR (NOT v_buy AND p_token_in > 0 AND p_usdc_out > 0 AND p_usdc_in = 0),
		400, 'Not a single swap'
	);
	PERFORM assert_that(
		p_usdc_reserve > 0 AND p_token_reserve > 0, 400, 'Pool reserves are empty'
	);
	-- Serializes ingests per creator, so a replay sees the first insert.
	PERFORM 1 FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');

	SELECT * INTO v_trade FROM trades t WHERE t.tx_hash = p_tx_hash;
	IF FOUND THEN
		PERFORM assert_that(
			v_trade.creator_id = p_creator AND v_trade.wallet = p_trader,
			409, 'Transaction already recorded for another trade'
		);
		RETURN v_trade;
	END IF;

	INSERT INTO pools(creator_id, usdc_reserve, token_reserve)
	VALUES (p_creator, p_usdc_reserve * 1e-6, p_token_reserve * 1e-18)
	ON CONFLICT (creator_id) DO UPDATE SET
		usdc_reserve = EXCLUDED.usdc_reserve,
		token_reserve = EXCLUDED.token_reserve,
		updated_at = now();

	IF v_buy THEN
		INSERT INTO holdings(creator_id, wallet, balance)
		VALUES (p_creator, p_trader, v_tokens)
		ON CONFLICT (creator_id, wallet)
		DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
			updated_at = now();
	ELSE
		-- The chain already enforced the balance; never go negative if an
		-- earlier transfer was not indexed.
		UPDATE holdings SET balance = greatest(balance - v_tokens, 0),
			updated_at = now()
		WHERE creator_id = p_creator AND wallet = p_trader;
	END IF;

	INSERT INTO trades(
		creator_id, wallet, side, usdc_amount, token_amount, price, fee, tx_hash
	)
	VALUES (
		p_creator, p_trader, CASE WHEN v_buy THEN 'BUY' ELSE 'SELL' END::trade_side,
		v_usdc, v_tokens, trunc(v_usdc / v_tokens, 18),
		CASE WHEN v_buy THEN v_usdc ELSE v_tokens END * 0.003, p_tx_hash
	)
	RETURNING * INTO v_trade;

	PERFORM emit_oracle_event(p_creator, 'TRADE', jsonb_build_object(
		'side', v_trade.side,
		'wallet', p_trader::TEXT,
		'usdcAmount', v_usdc::TEXT,
		'tokenAmount', v_tokens::TEXT,
		'price', v_trade.price::TEXT
	));
	RETURN v_trade;
END;
$$;

-- Records a LiquidISA `Invested` event (base units). `p_raise_closed` is true
-- when the same receipt holds `RaiseClosed`; the optional pool reserves come
-- from that receipt's pool `Seeded` event and replace the pool row before the
-- raise closes. Queues no chain job: the user already sent the transaction.
-- Idempotent on the transaction hash.
CREATE OR REPLACE FUNCTION ingest_onchain_invest(
	p_creator UUID,
	p_investor evm_address,
	p_tx_hash tx_hash,
	p_usdc NUMERIC,
	p_shares NUMERIC,
	p_raise_closed BOOLEAN DEFAULT FALSE,
	p_pool_usdc NUMERIC DEFAULT NULL,
	p_pool_tokens NUMERIC DEFAULT NULL
)
RETURNS investments
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
	v_inv investments;
	v_usdc NUMERIC := p_usdc * 1e-6;
	v_shares NUMERIC := p_shares * 1e-18;
BEGIN
	PERFORM assert_that(p_usdc > 0 AND p_shares > 0, 400, 'Amount must be positive');
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');

	SELECT * INTO v_inv FROM investments i WHERE i.tx_hash = p_tx_hash;
	IF FOUND THEN
		PERFORM assert_that(
			v_inv.creator_id = p_creator AND v_inv.wallet = p_investor,
			409, 'Transaction already recorded for another investment'
		);
		RETURN v_inv;
	END IF;

	INSERT INTO investments(creator_id, wallet, usdc_amount, token_amount, tx_hash)
	VALUES (p_creator, p_investor, v_usdc, v_shares, p_tx_hash)
	RETURNING * INTO v_inv;

	INSERT INTO holdings(creator_id, wallet, balance)
	VALUES (p_creator, p_investor, v_shares)
	ON CONFLICT (creator_id, wallet)
	DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
		updated_at = now();

	UPDATE creators SET raised_amount = least(raised_amount + v_usdc, target_raise)
	WHERE id = p_creator
	RETURNING * INTO v_creator;

	IF p_pool_usdc > 0 AND p_pool_tokens > 0 THEN
		UPDATE pools SET usdc_reserve = p_pool_usdc * 1e-6,
			token_reserve = p_pool_tokens * 1e-18, updated_at = now()
		WHERE creator_id = p_creator;
	END IF;

	PERFORM emit_oracle_event(p_creator, 'INVESTED', jsonb_build_object(
		'wallet', p_investor::TEXT,
		'usdcAmount', v_usdc::TEXT,
		'tokenAmount', v_shares::TEXT
	));
	IF p_raise_closed AND v_creator.raise_closed_at IS NULL THEN
		PERFORM finish_raise(p_creator);
	END IF;
	RETURN v_inv;
END;
$$;
-- ─── onchain ingest (END) ─────────────────────────────────────

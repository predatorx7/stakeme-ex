-- Migration 1: smx/ddl --
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
-- Domain tables, functions and enums are appended below by the backend
-- workstream.



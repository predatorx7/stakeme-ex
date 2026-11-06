#!/usr/bin/env bash

set -ex

export DB_URI="${DB_URI:-postgresql://postgres:@localhost:5442/postgres}"

echo "Connecting to $DB_URI"
export SCRIPT_DIR=$(dirname "$0");
# Disable psql's pager: loading the schema + seeds prints hundreds of command
# tags, and in an interactive terminal psql would pipe them into `less` (shows
# "(END)", waits for a keypress). `cat` streams straight through — inherited by
# the psql calls pg-migrate shells out to. (Doesn't trigger in non-TTY runs,
# which is why CI/pipes don't hang.)
export PSQL_PAGER=cat;

psql $DB_URI -c "DROP SCHEMA IF EXISTS smx CASCADE;";
# @haathie/pgmb: load the pgmb schema + functions from the installed package
# (callback delivery rides on it). Reload it cleanly each rebuild, and before
# pgtyped introspection so it can type queries that touch the pgmb schema.
psql $DB_URI -c "DROP SCHEMA IF EXISTS pgmb CASCADE;";
# pg-migrate's own bookkeeping table lives outside smx/pgmb (so the drops
# above don't touch it) and only applies a migration if its name isn't already
# recorded there. Without clearing these rows, `pgm apply` below would trust
# stale history from before the drop and skip files that need to re-run,
# erroring on schemas/tables it thinks already exist.
psql $DB_URI -c "DELETE FROM migrations WHERE name LIKE 'smx/%' OR name LIKE 'pgmb/%';" 2>/dev/null || true;
# Schema + seed data both come from packages/app/migrations/ now (pg-migrate),
# not sql/ddl.sql + sql/seed/*.sql (those seed files were moved into migrations
# in f924252). PG_MIGRATE_CONFIG_FILE needs an absolute path: pg-migrate loads
# it via dynamic import(), which doesn't resolve relative paths against cwd.
PG_MIGRATE_CONFIG_FILE="$(cd $SCRIPT_DIR/../packages/app && pwd)/pg-migrate.config.ts" \
	npm exec pgm apply -- --database-uri "$DB_URI";

# pgtyped types queries.sql by introspecting the schema, so its output only
# belongs to the local dev database. Against anything else this script is just
# a schema + seed apply, and must leave the committed types alone.
DB_HOST=${DB_URI#*//}
DB_HOST=${DB_HOST#*@}
DB_HOST=${DB_HOST%%[:/?]*}

case "$DB_HOST" in
	localhost | 127.0.0.1 | ::1)
		# Force a clean regen. pgtyped hashes each query's SQL text and skips ones
		# it thinks are unchanged, so a ddl.sql-only edit that changes a query's
		# result types would leave stale types behind.
		rm -f $SCRIPT_DIR/../packages/*/src/queries.ts;
		npm exec pgtyped -- -c $SCRIPT_DIR/../pgtyped.config.json --uri $DB_URI;
		;;
	*)
		echo "$DB_HOST is not the local dev database — skipping pgtyped";
		;;
esac

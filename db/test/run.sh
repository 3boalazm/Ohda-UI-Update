#!/usr/bin/env bash
# Applies all migrations to a fresh database on a Supabase-like stub and runs the RLS/permission tests.
set -euo pipefail
DB=${DB:-ohda_test}
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f db/test/00_supabase_stub.sql
for f in drizzle/migrations/0*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -d "$DB" -f db/test/90_tests.sql | tee /tmp/ohda-db-tests.out
grep -q "ALL DB TESTS PASSED" /tmp/ohda-db-tests.out

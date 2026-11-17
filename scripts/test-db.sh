#!/usr/bin/env bash
# Migratsiya, seed va xavfsizlik testlarini toza PostgreSQL bazasida tekshiradi.
# Foydalanish: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres scripts/test-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${DATABASE_URL:?DATABASE_URL kerak (superuser)}"
DB="govmind_test_$$"

psql "$URL" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
trap 'psql "$URL" -qc "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
TEST_URL="${URL%/*}/$DB"

psql "$URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='govmind_app') THEN CREATE ROLE govmind_app NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='govmind_auditor') THEN CREATE ROLE govmind_auditor NOLOGIN NOBYPASSRLS; END IF;
END $$;
SQL

for f in "$ROOT"/database/migrations/*.sql "$ROOT"/database/seeds/*.sql "$ROOT"/database/tests/*.sql; do
  echo "→ $(basename "$f")"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

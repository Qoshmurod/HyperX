#!/usr/bin/env bash
# PostgreSQL konteyneri birinchi marta ishga tushganda bajariladi.
# Ilova va auditor rollarini yaratadi, so'ng migratsiyalarni qo'llaydi.
set -euo pipefail

: "${GOVMIND_APP_DB_PASSWORD:?GOVMIND_APP_DB_PASSWORD o'rnatilmagan}"
: "${GOVMIND_AUDITOR_DB_PASSWORD:?GOVMIND_AUDITOR_DB_PASSWORD o'rnatilmagan}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$GOVMIND_APP_DB_PASSWORD" -v auditor_pw="$GOVMIND_AUDITOR_DB_PASSWORD" <<'SQL'
-- Ilova roli jadval egasi emas => RLS unga to'liq qo'llanadi. BYPASSRLS berilmaydi.
CREATE ROLE govmind_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'app_pw';
CREATE ROLE govmind_auditor LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'auditor_pw';
-- Keycloak o'z jadvallarini alohida sxemada saqlaydi
CREATE SCHEMA IF NOT EXISTS keycloak;
SQL

for f in /govmind/migrations/*.sql; do
  echo "Migratsiya: $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

if [ "${GOVMIND_LOAD_SEEDS:-false}" = "true" ]; then
  for f in /govmind/seeds/*.sql; do
    echo "Seed: $f"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
  done
fi

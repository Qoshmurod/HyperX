#!/usr/bin/env bash
# Tiklash sinovi: oxirgi (yoki berilgan) nusxani vaqtinchalik bazaga tiklaydi va tekshiradi.
#   RESTORE_ADMIN_URL — vaqtinchalik baza yaratish huquqiga ega ulanish (masalan .../postgres)
#   BACKUP_DIR, BACKUP_KEY_FILE — backup.sh bilan bir xil
# Foydalanish: restore-test.sh [nusxa-fayli]
set -euo pipefail

: "${RESTORE_ADMIN_URL:?}"
: "${BACKUP_DIR:?}"
: "${BACKUP_KEY_FILE:?}"

FILE="${1:-$(ls -1t "$BACKUP_DIR"/govmind-db-*.dump.enc 2>/dev/null | head -1)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "nusxa topilmadi" >&2; exit 1; }

if [ -f "$FILE.sha256" ]; then
  (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" >/dev/null) || { echo "nazorat summasi mos emas: $FILE" >&2; exit 1; }
fi

DB="govmind_restore_test_$(date +%s)"
TARGET="${RESTORE_ADMIN_URL%/*}/$DB"
cleanup() { psql "$RESTORE_ADMIN_URL" -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$RESTORE_ADMIN_URL" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $DB"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BACKUP_KEY_FILE" -in "$FILE" \
  | PGOPTIONS='-c session_replication_role=replica' pg_restore --no-owner --no-privileges --exit-on-error -d "$TARGET"
# replica rejimida audit triggerlari ishlamaydi: yozuvlar, vaqtlar va xeshlar aynan tiklanadi,
# keyin xesh-zanjir mustaqil tekshiriladi.

psql "$TARGET" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT 'organizations=' || count(*) FROM organization.organizations;
SELECT 'users=' || count(*) FROM iam.users;
SELECT 'tasks=' || count(*) FROM core.tasks;
SELECT 'audit_events=' || count(*) FROM audit.audit_events;
SELECT 'audit_chain=' || COALESCE('BROKEN at ' || audit.verify_chain()::text, 'intact');
DO $$ BEGIN
  IF audit.verify_chain() IS NOT NULL THEN RAISE EXCEPTION 'audit chain broken in restored copy'; END IF;
  IF (SELECT count(*) FROM organization.organizations) = 0 THEN RAISE EXCEPTION 'no organizations restored'; END IF;
END $$;
SQL
echo "tiklash sinovi muvaffaqiyatli: $FILE"

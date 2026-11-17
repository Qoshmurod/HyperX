#!/usr/bin/env bash
# Ma'lumotlar bazasining shifrlangan zaxira nusxasi.
#   BACKUP_DATABASE_URL  — pg_dump uchun ulanish (faqat o'qish huquqli rol yetarli)
#   BACKUP_DIR           — nusxalar papkasi (alohida diskda bo'lishi tavsiya etiladi)
#   BACKUP_KEY_FILE      — shifrlash kaliti fayli (repository'da emas!)
#   BACKUP_RETENTION_DAYS — saqlash muddati (standart 30)
#   METRICS_DIR          — node-exporter textfile collector papkasi (ixtiyoriy)
set -euo pipefail

: "${BACKUP_DATABASE_URL:?}"
: "${BACKUP_DIR:?}"
: "${BACKUP_KEY_FILE:?}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"

[ -r "$BACKUP_KEY_FILE" ] || { echo "kalit fayli o'qilmaydi: $BACKUP_KEY_FILE" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
umask 077

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/govmind-db-$STAMP.dump.enc"
TMP="$OUT.partial"

pg_dump --format=custom --no-owner --no-privileges "$BACKUP_DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$BACKUP_KEY_FILE" -out "$TMP"
mv "$TMP" "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
echo "zaxira nusxa: $OUT ($(du -h "$OUT" | cut -f1))"

# Eski nusxalarni tozalash
find "$BACKUP_DIR" -name 'govmind-db-*.dump.enc*' -type f -mtime "+$RETENTION" -print -delete

if [ -n "${METRICS_DIR:-}" ]; then
  mkdir -p "$METRICS_DIR"
  printf 'govmind_backup_last_success_timestamp_seconds %s\n' "$(date +%s)" > "$METRICS_DIR/govmind_backup.prom.$$"
  mv "$METRICS_DIR/govmind_backup.prom.$$" "$METRICS_DIR/govmind_backup.prom"
fi

# Falokatdan tiklash (Disaster Recovery)

## Nima zaxiralanadi

| Komponent | Usul | Chastota |
|---|---|---|
| PostgreSQL (barcha sxemalar, Keycloak ham) | `infrastructure/backup/backup.sh` — pg_dump, AES-256 shifrlash | har kuni (`backup` profili) |
| MinIO hujjatlari (allaqachon shifrlangan) | `mc mirror` alohida diskka/serverga | har kuni |
| Qdrant indeksi | qayta tiklanadi: hujjatlarni qayta indekslash | — |
| `.env`, `secrets/` | xavfsiz joyda, alohida | o'zgarganda |
| Zaxira shifrlash kaliti | kamida 2 ta mustaqil joyda (seyf/HSM) | — |

## Tiklash tartibi (tugun to'liq yo'qolganda)

1. Yangi serverga Docker o'rnating, repository va `.env`, `secrets/` ni tiklang.
2. Faqat bazani ishga tushiring: `docker compose up -d postgres`.
3. Init skripti yaratgan bo'sh sxemani o'chirib, nusxani tiklang (triggerlar `replica`
   rejimida o'chiriladi, audit yozuvlari aynan tiklanadi):

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:secrets/backup.key -in backups/<fayl>.dump.enc | docker compose exec -T -e PGOPTIONS='-c session_replication_role=replica' postgres pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

4. Audit zanjirini tekshiring: `SELECT audit.verify_chain();` → `NULL`.
5. MinIO hujjatlarini tiklang, qolgan servislarni ishga tushiring.
6. Qdrant indeksini qayta qurish uchun hujjatlarni qayta indekslang (`index_status` ni `pending`
   qilib, keyin hujjatlar qayta yuklanadi).
7. Tugun yuqori tugunga ulansa, outbox'dagi yuborilmagan hodisalar avtomatik yuboriladi;
   yuqori tugundan feed qayta olinadi.

## Mashq

- Oyiga bir marta: `restore-test.sh` (avtomatik, CI'da ham bajariladi).
- Chorakda bir marta: to'liq tiklash mashqi alohida serverda, vaqt o'lchanadi (RTO), oxirgi
  nusxa vaqti qayd etiladi (RPO). Natijalar pilotdan keyin SLO sifatida belgilanadi.

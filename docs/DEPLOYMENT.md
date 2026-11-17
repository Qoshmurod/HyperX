# GovMind AI — O'rnatish

## 1. Talablar

| Tugun | CPU | RAM | Disk | GPU |
|---|---|---|---|---|
| Tuman (AI bilan) | 8 yadro | 32 GB | 500 GB SSD | ixtiyoriy (7B model CPU'da sekin ishlaydi) |
| Viloyat | 16 yadro | 64 GB | 1 TB SSD | 1× 24 GB tavsiya etiladi |
| Markaz | klaster | — | — | vLLM uchun GPU klasteri |

Dasturiy ta'minot: Linux, Docker 24+ va Docker Compose v2. Zaxira nusxalar uchun alohida disk.

Aniq javob vaqti, foydalanuvchilar soni, RPO/RTO va mavjudlik foizlari pilot yuklama
o'lchovlaridan keyin SLO sifatida belgilanadi ([pilot rejasi](deployment/pilot-plan.md)).

## 2. Production o'rnatish (bitta tugun)

1. Repository'ni serverga ko'chiring va tugun profilidan `.env` tayyorlang:

```bash
cp deployments/local-node/env.example .env
```

2. `.env` ga [/.env.example](../.env.example) dagi qolgan o'zgaruvchilarni qo'shing va barcha
   maxfiy qiymatlarni yarating:

```bash
openssl rand -base64 32
```

3. Maxfiy fayllar (repository'dan tashqarida saqlanadi):

```bash
mkdir -p secrets && openssl rand -base64 48 > secrets/backup.key && openssl rand -hex 32 > secrets/metrics_token && chmod 600 secrets/*
```

   `METRICS_TOKEN` qiymati `secrets/metrics_token` bilan bir xil bo'lishi kerak. Zaxira kaliti
   alohida, xavfsiz joyda ham saqlanadi — usiz nusxani tiklab bo'lmaydi.

4. TLS sertifikatlari: `infrastructure/nginx/tls/fullchain.pem` va `privkey.pem`
   (yoki `.env` da `TLS_DIR`).

5. Ishga tushirish:

```bash
docker compose --profile ai --profile edge --profile backup --profile monitoring up -d --build
```

6. Lokal LLM modellarini yuklab olish (internet bor paytda yoki oflayn ko'chirilgan fayldan):

```bash
docker compose exec ollama ollama pull qwen2.5:7b-instruct && docker compose exec ollama ollama pull bge-m3
```

7. Birinchi administrator:
   - Keycloak admin konsolida (`/admin`, faqat ichki tarmoqdan) foydalanuvchi yarating.
   - GovMind bazasida unga `super_admin` rolini bering (faqat birinchi marta, keyin barcha
     rollar interfeys orqali beriladi):

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "INSERT INTO iam.users (external_auth_id, username, full_name) VALUES ('pending:admin', 'admin', 'Administrator') RETURNING id"
```

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "INSERT INTO iam.user_roles (user_id, role_id, administrative_unit_id, max_classification) SELECT u.id, r.id, a.id, 'secret' FROM iam.users u, iam.roles r, organization.administrative_units a WHERE u.username = 'admin' AND r.code = 'super_admin' AND a.parent_id IS NULL"
```

   Hududlar iyerarxiyasi bo'sh bo'lsa, avval respublika hududini qo'shing
   (`organization.administrative_units`, `level = 'republic'`).

8. Tekshirish: `https://<manzil>/` — kirish sahifasi; `docker compose ps` — barcha servislar
   `healthy`; Grafana (`127.0.0.1:3002`) — "GovMind AI" dashboard.

## 3. Tugunlarni bog'lash

[deployments/README.md](../deployments/README.md) ga qarang. Tugunlararo kanal VPN yoki mTLS
orqali bo'lishi kerak; `X-Node-Token` qo'shimcha autentifikatsiya qatlami.

## 4. Lokal ishlab chiqish

```bash
scripts/dev-up.sh
```

## 5. Yangilash

```bash
git pull && docker compose --profile ai --profile edge --profile backup --profile monitoring up -d --build
```

Yangi migratsiyalar (`database/migrations/NNNN_*.sql`) yangilashdan oldin zaxira nusxa olingach,
egasi (owner) roli bilan qo'llanadi:

```bash
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /govmind/migrations/<fayl>.sql
```

## 6. Zaxira nusxa va tiklash

`backup` profili har kuni shifrlangan nusxa oladi. Tiklash sinovi oyiga kamida bir marta:

```bash
RESTORE_ADMIN_URL=postgresql://<owner>:<parol>@localhost:5432/postgres BACKUP_DIR=./backups BACKUP_KEY_FILE=./secrets/backup.key infrastructure/backup/restore-test.sh
```

Batafsil: [falokatdan tiklash](deployment/disaster-recovery.md).

## 7. Muammolarni bartaraf etish

**"Tizimga kirish" bosilganda kirish sahifasiga qaytadi yoki xato chiqadi**

| Xabar | Sabab | Yechim |
|---|---|---|
| "Kirish serveri (Keycloak) bilan bog'lanib bo'lmadi" | Keycloak ishlamayapti yoki web unga ulana olmayapti | `docker compose ps keycloak` — `running` bo'lishi kerak; `docker compose logs keycloak`. Web lokal ishga tushirilgan bo'lsa, `OIDC_ISSUER_URL` brauzerda ochilishini tekshiring: `http://localhost:8080/realms/govmind` |
| "Tizim serveri (API) javob bermayapti" | API yoki PostgreSQL ishlamayapti | `docker compose logs api`, `docker compose ps postgres` |
| "Hisobingiz GovMind'da ro'yxatdan o'tmagan" | Keycloak'dagi login GovMind'da yo'q | Xodimlar bo'limida xuddi shu login bilan xodim yarating ([DEPLOYMENT](#2-production-ornatish-bitta-tugun), 7-qadam) |
| "Kirish yakunlanmadi" | Client secret yoki redirect URI mos emas | `.env` dagi `OIDC_CLIENT_SECRET` Keycloak'dagi bilan bir xil; `WEB_BASE_URL` brauzerdagi manzil bilan bir xil bo'lishi kerak |

Web konteyner ichidan Keycloak'ga `OIDC_DISCOVERY_URL` (ichki manzil) orqali ulanadi, issuer esa
tashqi `OIDC_ISSUER_URL` bilan solishtiriladi. Keycloak `KC_HOSTNAME_BACKCHANNEL_DYNAMIC=true`
bilan ishlashi shart.

**Ikki bosqichli tasdiqlash (TOTP).** Birinchi kirishda telefoningizga Google Authenticator,
Microsoft Authenticator yoki FreeOTP o'rnating va QR-kodni skanerlang. Telefon vaqti to'g'ri
bo'lishi kerak (avtomatik vaqt yoqilgan).

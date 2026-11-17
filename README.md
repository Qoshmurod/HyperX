# GovMind AI

**Enterprise AI-powered Government Intelligence and Decision Support Platform with Hybrid Offline-First Architecture.**

| | |
|---|---|
| Loyiha turi | Government AI Platform |
| Arxitektura | Hybrid / Distributed, offline-first |
| Dastlabki joriy etish | Tuman → Viloyat → Respublika |
| Tillar | O'zbek (lotin), O'zbek (kirill), Rus, Ingliz |
| Litsenziya | MIT |

GovMind AI — davlat tashkilotlarining ma'lumotlarini yig'ish, tartibga solish, tahlil qilish va
boshqaruv qarorlarini tayyorlashga ko'maklashuvchi sun'iy intellekt platformasi. Lokal (tuman,
viloyat) va markaziy serverlarda ishlaydi, internet uzilganda ham asosiy funksiyalar to'xtamaydi.

> AI mustaqil ravishda davlat qarori chiqarmaydi — u faqat qaror variantlarini tayyorlaydi,
> yakuniy qarorni vakolatli rahbar tasdiqlaydi (Human-in-the-Loop, "to'rt ko'z" tamoyili).

## Imkoniyatlar

| Modul | Nima qiladi |
|---|---|
| 01 Central Administration | Hududlar iyerarxiyasi (respublika → viloyat → tuman), tashkilotlar, bo'limlar, xodimlar, rollar; huquqni oshirib yuborishdan himoya |
| 02 AI Analyst | Tabiiy tildagi savol → oldindan belgilangan read-only so'rov → statistik izoh, jadval, grafik va manba |
| 03 Decision Intelligence | Muammo → sabablar → 3 variant (ta'sir hisobi, faraz, xavf, cheklov) → inson tasdig'i |
| 04 Performance Monitoring | Topshiriqlar, mas'ullar, muddatlar, KPI (reja/amal), dashboard, og'ishlar |
| 05 Forecast Engine | Holt-Winters, Holt, mavsumiy naiv; avtomatik tanlov, MAE/MAPE, 80% oraliq, ssenariy, anomaliyalar |
| 06 Report Intelligence | Kunlik/haftalik/oylik/choraklik hisobotlar, hududlararo taqqoslash, AI izohi, PDF/XLSX/DOCX (4 tilda) |
| 07 Natural Language Interface | O'zbek (lotin va kirill), rus va ingliz tilida savol-javob |
| 08 Notification Center | Tizim ichida, email, Telegram; muddat, kechikish, AI aniqlagan og'ish, kritik xato |
| 09 Audit & Compliance | O'zgartirib bo'lmaydigan, xesh-zanjirli jurnal; alohida auditor roli; butunlik tekshiruvi |
| 10 Integration Gateway | API kalitlar, imzolangan webhooklar, CSV/XLSX/JSON import-eksport, xatolar monitoringi |
| RAG | Hujjat yuklash, shifrlab saqlash, vakolat doirasidagi semantik qidiruv, manba va sahifa bilan javob |
| Hybrid sync | Outbox/Inbox, idempotentlik, versiyalar, egalik qoidalari, konfliktlarni qo'lda hal qilish |

## Tuzilma

```text
apps/
  web/          Next.js — interfeys (4 til), Keycloak OIDC orqali kirish (BFF, token brauzerga chiqmaydi)
  api/          NestJS — biznes mantiq, RBAC/ABAC, RLS, audit, sync, integratsiya, ishchi jarayonlar
  ai-engine/    FastAPI — AI Gateway, Analyst, RAG (Qdrant), prognoz, qaror loyihalari, o'zbek NLP
packages/
  i18n/         Tarjimalar va lotin→kirill transliteratsiya (web va api uchun umumiy)
database/       Migratsiyalar, sintetik seed, xavfsizlik testlari
infrastructure/ Keycloak realm, Nginx, Prometheus/Grafana, backup/restore, Postgres init
deployments/    Tuman, viloyat, markaz va dev profillari
docs/           Arxitektura, xavfsizlik, deployment, foydalanuvchi qo'llanmalari, ADR
```

## Tezkor boshlash (demo)

```bash
cp deployments/dev/env.example .env
```

```bash
scripts/dev-up.sh
```

Skript infratuzilmani (PostgreSQL, Qdrant, MinIO, Keycloak) Docker'da ko'taradi va ilovalarni
ishga tushirish buyruqlarini ko'rsatadi. Demo hisoblar (parol `.env` dagi `GOVMIND_DEMO_PASSWORD`,
birinchi kirishda TOTP sozlanadi): `superadmin`, `viloyat.rahbar`, `tuman.rahbar`,
`tuman.analitik`, `tuman.xodim`, `auditor`, `tuman2.rahbar`.

Production o'rnatish: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Testlar

```bash
pnpm install && pnpm --filter @govmind/i18n build && pnpm typecheck
```

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm test
```

```bash
cd apps/ai-engine && pip install -e ".[dev]" && ruff check . && pytest -q
```

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres scripts/test-db.sh
```

## Hujjatlar

| Hujjat | Mazmuni |
|---|---|
| [REQUIREMENTS.md](docs/REQUIREMENTS.md) | Funksional texnik topshiriq |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Hybrid arxitektura, sinxronizatsiya, stack |
| [DATABASE.md](docs/DATABASE.md) | Sxemalar, RLS, audit, sync |
| [AI-ARCHITECTURE.md](docs/AI-ARCHITECTURE.md) | AI Gateway, Analyst, RAG, prognoz, NLP |
| [API.md](docs/API.md) | Barcha endpointlar |
| [SECURITY.md](SECURITY.md) | Xavfsizlik siyosati |
| [docs/security](docs/security) | Tahdidlar modeli, ma'lumot klassifikatsiyasi, pentest ro'yxati |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | O'rnatish |
| [docs/deployment](docs/deployment) | Falokatdan tiklash, pilot rejasi |
| [docs/user-guides](docs/user-guides) | Foydalanuvchi qo'llanmalari |
| [ROADMAP.md](docs/ROADMAP.md) | Holat va keyingi qadamlar |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Hissa qo'shish |

> **Muhim:** `.env`, parollar, API kalitlari, haqiqiy davlat ma'lumotlari va maxfiy hujjatlar hech
> qachon repository'ga yuklanmaydi. Seed va testlarda faqat sintetik ma'lumotlar.

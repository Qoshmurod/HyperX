# GovMind AI

**Enterprise AI-powered Government Intelligence and Decision Support Platform with Hybrid Offline-First Architecture.**

| | |
|---|---|
| Loyiha turi | Government AI Platform |
| Arxitektura | Hybrid / Distributed |
| Murakkablik | Enterprise |
| Dastlabki joriy etish | Tuman |
| Kengayish | Viloyat → Respublika |
| Litsenziya | MIT |
| Asosiy til | O'zbek |

GovMind AI — davlat tashkilotlarining ma'lumotlarini yig'ish, tartibga solish, tahlil qilish va
boshqaruv qarorlarini tayyorlashga ko'maklashuvchi sun'iy intellekt platformasi. U hududiy
boshqaruvdan respublika darajasigacha kengayadi, lokal va markaziy serverlarda ishlaydi va o'zbek
tilini qo'llab-quvvatlaydi.

## Asosiy vazifalar

1. Davlat tashkilotlaridagi ma'lumotlarni yagona tizimga birlashtirish.
2. Ma'lumotlardagi muammolar va tendensiyalarni aniqlash.
3. Rahbarlar uchun tahliliy hisobotlar tayyorlash.
4. Kelajakdagi ehtiyoj va yuklamalarni prognozlash.
5. Ma'lumotlarga asoslangan qaror variantlarini ishlab chiqish.

> AI mustaqil ravishda davlat qarori chiqarmaydi — u faqat qaror variantlarini tayyorlaydi,
> yakuniy qarorni inson tasdiqlaydi (Human-in-the-Loop).

## Tamoyillar

Security by Design · Privacy by Design · Offline First · AI Explainability · Human-in-the-Loop ·
Zero Trust Architecture · Modular Architecture · High Availability · Data Sovereignty

## Repository tuzilmasi

```text
apps/
  web/          Next.js + TypeScript frontend
  api/          NestJS asosiy backend (biznes mantiq, RBAC/ABAC, audit)
  ai-engine/    Python + FastAPI AI servislari (gateway, analyst, RAG, forecast, NLP)
packages/       Umumiy turlar, API klient, UI, konfiguratsiya, validatsiya
infrastructure/ Docker, Kubernetes, Nginx, Keycloak, Postgres, Redis, Qdrant, MinIO, monitoring
deployments/    local-node, regional-node, central-cloud profillari
database/       Migratsiyalar, seed (faqat sintetik), sxemalar
docs/           Arxitektura, API, xavfsizlik, DB, AI, deployment, foydalanuvchi qo'llanmalari
```

## Tezkor boshlash (lokal ishlab chiqish)

```bash
cp .env.example .env
```

```bash
docker compose up -d postgres redis qdrant minio keycloak
```

```bash
pnpm install && pnpm --filter @govmind/api dev
```

```bash
cd apps/ai-engine && pip install -e ".[dev]" && uvicorn app.main:app --reload --port 8000
```

Batafsil: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Hujjatlar

| Hujjat | Mazmuni |
|---|---|
| [REQUIREMENTS.md](docs/REQUIREMENTS.md) | Funksional texnik topshiriq (10 modul) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Hybrid arxitektura, sinxronizatsiya, texnologik stack |
| [DATABASE.md](docs/DATABASE.md) | Ma'lumotlar bazasi sxemalari va xavfsizligi |
| [AI-ARCHITECTURE.md](docs/AI-ARCHITECTURE.md) | AI Gateway, Analyst, RAG, Forecast, Uzbek NLP |
| [API.md](docs/API.md) | API endpoint guruhlari |
| [SECURITY.md](SECURITY.md) | Xavfsizlik siyosati va zaifliklarni xabar qilish |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | O'rnatish |
| [ROADMAP.md](docs/ROADMAP.md) | Rivojlanish bosqichlari (Phase 0–8) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Hissa qo'shish qoidalari |
| [docs/adr](docs/adr) | Arxitektura qarorlari (ADR) |

## Joriy holat

Loyiha **Phase 0–1** bosqichida: hujjatlar, monorepo, Docker muhiti, boshlang'ich DB migratsiyasi,
NestJS va FastAPI servislarining skeleti, CI. Funksional modullar [ROADMAP](docs/ROADMAP.md) bo'yicha
qo'shiladi.

> **Muhim:** `.env`, parollar, API kalitlari, haqiqiy davlat ma'lumotlari va maxfiy hujjatlar hech
> qachon repository'ga yuklanmaydi.

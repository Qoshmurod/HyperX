# GovMind AI — O'rnatish

## Talablar

- Docker 24+ va Docker Compose v2
- Ishlab chiqish uchun: Node.js 22, pnpm 10, Python 3.11+
- Lokal AI uchun: kamida 16 GB RAM (7B model, 4-bit kvantlash)

## Lokal ishlab chiqish

```bash
cp .env.example .env
```

`.env` ichidagi barcha `change-me` qiymatlarini almashtiring, so'ng infratuzilmani ishga tushiring:

```bash
docker compose up -d postgres redis qdrant minio keycloak
```

Birinchi ishga tushishda PostgreSQL `govmind_app` va `govmind_auditor` rollarini yaratadi va
migratsiyalarni qo'llaydi (`infrastructure/postgres/init/00-roles.sh`).

```bash
pnpm install
```

```bash
pnpm --filter @govmind/api build && pnpm --filter @govmind/api start
```

```bash
pnpm --filter @govmind/web dev
```

```bash
cd apps/ai-engine && pip install -e ".[dev]" && uvicorn app.main:app --reload --port 8000
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1/health, Swagger: http://localhost:3001/api/docs
- AI engine: http://localhost:8000/health

## Barcha servislar konteynerda

```bash
docker compose --profile app --profile ai up -d --build
```

## Tugun profillari

| Profil | Papka | Tavsif |
|---|---|---|
| Tuman tuguni | `deployments/local-node` | Bitta server, lokal AI, offline rejim |
| Viloyat tuguni | `deployments/regional-node` | Viloyat bo'yicha agregatsiya |
| Markaziy bulut | `deployments/central-cloud` | Hududlararo analitika, zaxira nusxalar |

Har bir profil uchun alohida konfiguratsiya Phase 5 da qo'shiladi. Kubernetes manifestlari
(`infrastructure/kubernetes`) yuklama talablari asoslangandan keyin.

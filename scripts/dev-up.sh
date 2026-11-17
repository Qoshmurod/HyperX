#!/usr/bin/env bash
# Lokal ishlab chiqish: infratuzilma Docker'da, ilovalar lokal (hot reload).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f .env ] || cp deployments/dev/env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis qdrant minio keycloak
echo "Infratuzilma ishga tushdi. Endi alohida terminallarda:"
echo "  cd apps/ai-engine && pip install -e '.[dev]' && AI_ENGINE_TOKEN=dev-internal-token uvicorn app.main:app --reload --port 8000"
echo "  pnpm --filter @govmind/i18n build && pnpm --filter @govmind/api build && (set -a; . ./.env; set +a; DATABASE_URL=postgresql://govmind_app:\$GOVMIND_APP_DB_PASSWORD@localhost:5432/\$POSTGRES_DB node apps/api/dist/main.js)"
echo "  (set -a; . ./.env; set +a; API_INTERNAL_URL=http://localhost:3001 pnpm --filter @govmind/web dev)"

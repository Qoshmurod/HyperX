# GovMind AI — API

API versiyalangan (`/api/v1`). OpenAPI hujjati ishlab chiqish rejimida `http://localhost:3001/api/docs` da.

| Endpoint | Vazifasi | Holat |
|---|---|---|
| `/api/v1/auth` | Autentifikatsiya (Keycloak OIDC) | rejada |
| `/api/v1/users` | Xodimlar | rejada |
| `/api/v1/organizations` | Tashkilotlar | skelet |
| `/api/v1/permissions` | Ruxsatlar | rejada |
| `/api/v1/tasks` | Topshiriqlar | rejada |
| `/api/v1/analytics` | Analitika | rejada |
| `/api/v1/ai/chat` | AI suhbat | rejada |
| `/api/v1/ai/analyze` | Tahlil | rejada |
| `/api/v1/ai/forecast` | Prognoz | rejada |
| `/api/v1/reports` | Hisobotlar | rejada |
| `/api/v1/audit` | Audit | rejada |
| `/api/v1/sync` | Sinxronizatsiya | rejada |
| `/api/v1/integrations` | Integratsiyalar | rejada |
| `/api/v1/health` | Server holati | ✅ |

Barcha endpointlarda autentifikatsiya, vakolat tekshiruvi, validatsiya va audit siyosati bo'ladi.
`/health` dan tashqari har bir endpoint standart holatda yopiq (deny by default).

## AI Engine ichki API

`ai-engine` faqat ichki tarmoqda (`api` servisidan) chaqiriladi.

| Endpoint | Vazifasi |
|---|---|
| `GET /health` | Holat |
| `POST /internal/v1/nlp/normalize` | O'zbek matnini normallashtirish (kirill → lotin) |
| `GET /internal/v1/models` | Model reestri |

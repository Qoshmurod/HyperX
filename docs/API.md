# GovMind AI — API

Asosiy manzil: `/api/v1`. OpenAPI (Swagger): ishlab chiqish rejimida `/api/docs`
(production'da `SWAGGER_ENABLED=true` bo'lmasa o'chiq, Nginx orqali tashqariga chiqarilmaydi).

## Autentifikatsiya

| Usul | Sarlavha | Kim uchun |
|---|---|---|
| Keycloak access token | `Authorization: Bearer <token>` | Foydalanuvchilar (web BFF orqali) |
| API kalit | `X-Api-Key: gm_...` | Tashqi tizimlar; faqat belgilangan endpointlar |
| Tugun tokeni | `X-Node-Token: gmn_...` | Boshqa GovMind tugunlari (`/sync/events`, `/sync/feed`) |

Barcha endpointlar standart holatda yopiq. Ruxsat (RBAC) guard'da, hudud va maxfiylik darajasi
(ABAC) servis qatlamida va PostgreSQL RLS'da tekshiriladi. Til `X-Lang` yoki `Accept-Language`
sarlavhasidan olinadi: `uz`, `uz-Cyrl`, `ru`, `en`.

Xato kodlari: `400` validatsiya, `401` autentifikatsiya yo'q, `403` ruxsat yo'q, `404` topilmadi
yoki doiradan tashqarida, `409` versiya to'qnashuvi (optimistic locking), `429` so'rovlar chegarasi.

## Endpointlar

| Metod va yo'l | Ruxsat | Tavsif |
|---|---|---|
| `GET /health`, `GET /health/ready` | ochiq | Holat; ready — DB va AI engine |
| `GET /metrics` | `METRICS_TOKEN` | Prometheus metrikalari |
| `GET /auth/me` | token | Joriy foydalanuvchi, ruxsatlar, hududlar |
| `POST /auth/events` | token | Kirish/chiqish auditi (web BFF) |
| `GET/POST /administrative-units` | `organizations.read` / `.manage` | Hududlar |
| `GET/POST /organizations`, `GET/PATCH /organizations/:id` | `organizations.read` / `.manage` | Tashkilotlar |
| `GET /organizations/:id/members` | `organizations.read` | Tashkilot a'zolari |
| `POST /organizations/:id/departments` | `organizations.manage` | Bo'limlar |
| `GET /roles`, `GET /permissions` | `organizations.read` | Rollar katalogi |
| `GET/POST /users`, `GET/PATCH /users/:id` | `users.manage` | Xodimlar |
| `POST /users/:id/roles`, `DELETE /users/:id/roles/:grantId` | `roles.manage` | Rol berish/olish (huquqni oshirishdan himoya) |
| `GET/POST /tasks`, `GET/PATCH /tasks/:id` | `tasks.read` / `.manage` (+API kalit) | Topshiriqlar (`version` bilan) |
| `POST/DELETE /tasks/:id/assignees[/:userId]` | `tasks.manage` | Mas'ullar |
| `GET/POST /kpi/definitions`, `GET /kpi/definitions/:id` | `kpi.read` / `.manage` | KPI |
| `POST /kpi/definitions/:id/measurements` | `kpi.manage` (+API kalit) | KPI natijasi |
| `GET /analytics/dashboard`, `GET /analytics/kpi-overview` | `tasks.read` / `kpi.read` | Dashboard |
| `POST /ai/chat`, `POST /ai/analyze` | `ai.use` | Tabiiy tilda savol (ma'lumot yoki hujjatlar) |
| `GET /ai/conversations[/:id]`, `GET /ai/runs/:id` | `ai.use` | Suhbatlar, AI bajarilishi va manbalari |
| `POST /ai/forecast` | `ai.forecast` + `kpi.read` | KPI prognozi va ssenariy |
| `GET/POST /decisions`, `GET /decisions/:id` | `decisions.create` | Qaror loyihalari |
| `POST /decisions/:id/submit` | `decisions.create` | Ko'rib chiqishga yuborish |
| `POST /decisions/:id/approve`, `/reject` | `decisions.approve` | Tasdiqlash (muallif o'zi tasdiqlay olmaydi) |
| `GET /reports`, `GET /reports/:id`, `POST /reports/generate` | `reports.read` | Hisobotlar |
| `POST /reports/:id/submit`, `/approve` | `reports.read` / `reports.approve` | Hisobot holati |
| `GET /reports/:id/export?format=pdf\|xlsx\|docx&lang=` | `reports.export` | Eksport |
| `GET/POST /documents`, `GET /documents/:id/download` | `documents.read` / `.upload` | Hujjatlar (shifrlangan saqlash) |
| `POST /documents/search` | `documents.read` | Vakolat doirasida semantik qidiruv |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | token | Bildirishnomalar |
| `GET/PUT /notifications/preferences` | token | Email/Telegram sozlamalari |
| `GET /audit`, `GET /audit/verify` | `audit.read` | Audit jurnali (auditor DB roli) |
| `GET/POST /integrations/clients`, `DELETE /integrations/clients/:id` | `integrations.manage` | API mijozlar |
| `GET/POST /integrations/webhooks`, `DELETE /integrations/webhooks/:id`, `GET .../deliveries` | `integrations.manage` | Webhooklar |
| `POST /integrations/import/:kind?organization_id=` | `tasks.manage` / `kpi.manage` (+API kalit) | CSV/XLSX/JSON import |
| `GET /integrations/export/tasks?format=` | `tasks.read` (+API kalit) | Eksport |
| `GET /integrations/health` | `integrations.manage` | Integratsiya xatolari |
| `POST /sync/events`, `GET /sync/feed?after=` | tugun tokeni | Tugunlararo almashinuv |
| `GET /sync/status`, `GET /sync/conflicts`, `POST /sync/conflicts/:id/resolve` | `sync.resolve` | Holat va konfliktlar |
| `GET/POST /sync/nodes`, `POST /sync/nodes/:id/disable` | `sync.manage` | Quyi tugunlar |

## Webhook formati

```http
POST <url>
X-GovMind-Event: task.created
X-GovMind-Delivery: <event uuid — idempotentlik kaliti>
X-GovMind-Timestamp: <unix soniya>
X-GovMind-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>
```

Qabul qiluvchi imzoni va vaqtni (masalan ±5 daqiqa) tekshirishi, `X-GovMind-Delivery` bo'yicha
takrorlarni rad etishi kerak. Javob 2xx bo'lmasa, yetkazish exponential backoff bilan 10 martagacha
qaytariladi.

## AI engine (ichki)

`ai-engine` faqat ichki tarmoqda, `X-Internal-Token` bilan chaqiriladi: `/internal/v1/analyst/plan`,
`/analyst/explain`, `/decisions/draft`, `/forecast`, `/anomalies`, `/reports/commentary`,
`/rag/index`, `/rag/search`, `/rag/answer`, `/rag/delete`, `/nlp/normalize`, `/models`.

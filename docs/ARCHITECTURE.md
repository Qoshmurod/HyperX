# GovMind AI — Arxitektura

## 1. Ishlash modeli

GovMind AI ikki muhitda ishlaydi.

**A. Local Government Node** — tuman yoki tashkilot ichida o'rnatiladigan lokal server:
mahalliy ma'lumotlarni saqlash, lokal autentifikatsiya, internetsiz ishlash, lokal AI modellari,
o'zgarishlarni sinxronizatsiya navbatiga (Outbox) joylash.

**B. Central Government Cloud** — markaziy ma'lumotlar markazi: hududlararo analitika, markaziy
boshqaruv, ruxsat etilgan ma'lumotlarni birlashtirish, markaziy AI modellari, umumiy hisobotlar,
zaxira nusxalar.

```text
          CENTRAL GOVERNMENT CLOUD
        ┌──────────────────────────┐
        │     Central API Gateway  │
        │     AI Orchestrator      │
        │     Analytics Engine     │
        │     Central PostgreSQL   │
        │     Central AI Models    │
        └────────────┬─────────────┘
                     │
              Secure Sync API (mTLS)
                     │
        ┌────────────┴─────────────┐
        │                          │
   REGIONAL NODE              DISTRICT NODE
   Local Database             Local Database
   Local AI                   Local AI
   Local API                  Local API
        │                          │
   Regional Users             District Users
```

## 2. Servislar va mas'uliyat chegaralari

```text
 Browser ──► Nginx ──► web (Next.js)
                 └──► api (NestJS) ──► PostgreSQL / Redis / MinIO
                           │   ▲
                           │   └── Keycloak (OIDC, MFA)
                           ▼
                      ai-engine (FastAPI) ──► Ollama / vLLM, Qdrant
```

- **api (NestJS)** — yagona biznes mantiq manbai: autentifikatsiya tokenini tekshirish, RBAC/ABAC,
  audit, topshiriqlar, KPI, hisobotlar, sinxronizatsiya. Ma'lumotlar bazasiga faqat shu servis yozadi.
- **ai-engine (Python)** — AI vazifalari. U foydalanuvchi bilan bevosita gaplashmaydi: so'rov `api`
  orqali, foydalanuvchi vakolat konteksti (tashkilot, hudud, maxfiylik darajasi) bilan keladi.
  AI modeli almashtirilganda asosiy backendni qayta yozish talab qilinmaydi ([ADR-0002](adr/0002-separate-ai-engine.md)).
- **web (Next.js)** — UI; maxfiy mantiq yoki kalitlarni saqlamaydi.

## 3. Internet uzilganda

1. Lokal foydalanuvchilar tizimga kirishda davom etadi (lokal Keycloak).
2. Lokal ma'lumotlar bazasi ishlashda davom etadi.
3. Lokal AI modeli mavjud funksiyalarni bajaradi.
4. Internetga bog'liq xizmatlar vaqtinchalik cheklanadi.
5. Yangi o'zgarishlar `sync.outbox_events` ga yoziladi (biznes tranzaksiyasi bilan bitta tranzaksiyada).
6. Internet tiklanganda sinxronizatsiya boshlanadi.
7. Qarama-qarshi o'zgarishlar avtomatik yashirilmaydi — `sync.conflicts` ga tushadi va qo'lda hal qilinadi.

## 4. Sinxronizatsiya qoidalari

- Har bir yozuv uchun global UUID; har bir hodisa uchun yagona `event_id`.
- Idempotent API: qabul qiluvchi `sync.inbox_events (event_id PRIMARY KEY)` orqali takrorni rad etadi.
- Outbox/Inbox pattern; retry va exponential backoff.
- Har bir yozuvda `version` (optimistic concurrency); hodisa `base_version` ni olib yuradi.
- `base_version` qabul qiluvchidagi joriy versiyaga mos kelmasa — konflikt yoziladi, ustidan yozilmaydi.
- **`last write wins` taqiqlangan.** Har bir ma'lumot turi uchun asosiy yozuvchi tugun (`sync.ownership_rules`) oldindan belgilanadi.
- Sinxronizatsiya jurnali (`sync.sync_log`).

## 5. Texnologik stack

| Qatlam | Texnologiya |
|---|---|
| Frontend | Next.js + TypeScript, Tailwind CSS + shadcn/ui |
| Backend | NestJS |
| AI Backend | Python + FastAPI |
| Main Database | PostgreSQL |
| Cache / Queue | Redis, BullMQ |
| Vector Database | Qdrant |
| Object Storage | MinIO |
| Authentication | Keycloak (OIDC) |
| AI Runtime | Ollama / vLLM |
| API Documentation | OpenAPI / Swagger |
| Containers | Docker; Docker Compose, keyinchalik zarur bo'lsa Kubernetes |
| Monitoring | Prometheus + Grafana |
| Logs | OpenTelemetry + markazlashgan logging |
| Reverse Proxy | Nginx |
| CI/CD | GitHub Actions |

## 6. Arxitektura qarorlari

ADR'lar [docs/adr](adr) papkasida saqlanadi.

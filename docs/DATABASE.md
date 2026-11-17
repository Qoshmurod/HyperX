# GovMind AI — Ma'lumotlar bazasi

PostgreSQL 16. Migratsiyalar: `database/migrations/`, sintetik seed: `database/seeds/`,
xavfsizlik testlari: `database/tests/`.

## Sxemalar

| Sxema | Mazmuni |
|---|---|
| `app` | Yordamchi funksiyalar, `classification` turi, vakolat doirasi |
| `iam` | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `organization_memberships` |
| `organization` | `administrative_units`, `organizations`, `departments` |
| `core` | `tasks`, `task_assignments`, `documents`, `reports` |
| `analytics` | `kpi_definitions`, `kpi_measurements` |
| `ai` | `ai_conversations`, `ai_messages`, `ai_runs`, `ai_sources` |
| `audit` | `audit_events` (append-only, xesh-zanjir) |
| `integration` | `integration_configs` (kalitlar emas, `secret_ref` havolalari) |
| `sync` | `ownership_rules`, `sync_events` (outbox), `inbox_events`, `conflicts` |

## Hududiy iyerarxiya

`organization.administrative_units.path` — `ltree` turi: `demo` → `demo.v1` → `demo.v1.t1`.
Viloyat foydalanuvchisining doirasi `demo.v1` bo'lsa, u `path <@ 'demo.v1'` shartiga mos barcha
tumanlarni ko'radi, lekin respublika darajasini (`demo`) va boshqa viloyatlarni ko'rmaydi.

## Row-Level Security

API har bir tranzaksiya boshida endpoint uchun kerakli ruxsatga ega, amaldagi grantlarni o'rnatadi
([ADR-0004](adr/0004-grant-based-rls.md)):

```sql
BEGIN;
SELECT set_config('app.grants', '[{"p":"demo.v1.t1","c":"confidential"},{"p":"demo.v1.t2","c":"internal"}]', true);
-- ... so'rovlar ...
COMMIT;
```

- `app.visible(organization_id, classification)` — tashkilot hududi biror grant hududi ichida va
  yozuv darajasi o'sha grant darajasidan oshmaganini tekshiradi (grantlar aralashmaydi).
- Siyosatlar: `core.tasks`, `core.documents`, `core.reports`, `core.decision_drafts`,
  `analytics.*`, `ai.ai_runs`, `ai.ai_conversations`, `organization.*`.
- Grant o'rnatilmasa hech narsa ko'rinmaydi. `set_config(..., true)` tranzaksiya bilan tugaydi,
  shuning uchun ulanishlar pulida doira boshqa so'rovga o'tmaydi.
- Tizim vazifalari (scheduler, sync) tugunning ildiz hududi (`GOVMIND_ROOT_PATH`) bilan ishlaydi.

## Qo'shimcha jadvallar (0002)

| Jadval | Vazifasi |
|---|---|
| `core.decision_drafts` | Qaror loyihalari: sabablar, variantlar, inson tasdig'i |
| `analytics.forecasts` | Prognozlar: usul, nuqtalar, MAE/MAPE, ssenariy |
| `core.notifications`, `notification_preferences`, `notification_deliveries` | Bildirishnomalar va yetkazish navbati |
| `integration.api_clients`, `webhooks`, `webhook_deliveries`, `import_jobs` | Integratsiya shlyuzi |
| `sync.nodes`, `sync.cursors` | Quyi tugunlar (token xeshi) va pull kursorlari |

## Audit

- `govmind_app` faqat `INSERT` qila oladi, o'qiy olmaydi.
- `govmind_auditor` faqat o'qiydi.
- UPDATE/DELETE/TRUNCATE hatto jadval egasi uchun ham trigger orqali rad etiladi.
- Har bir yozuv `prev_hash` va `hash` (SHA-256) bilan oldingisiga bog'lanadi;
  `SELECT audit.verify_chain();` buzilgan birinchi yozuvni qaytaradi (`NULL` — zanjir butun).
- Production'da: oylik partitioning va zanjir oxirgi xeshini tashqi joyga muntazam yozib borish.

## Sinxronizatsiya

- Har bir sinxronlanadigan jadvalda `version` ustuni; har UPDATE'da trigger uni oshiradi.
- Outbox (`sync.sync_events`) biznes o'zgarishi bilan bitta tranzaksiyada yoziladi.
- Inbox (`sync.inbox_events.event_id` PRIMARY KEY) takroriy hodisani rad etadi.
- `base_version` mos kelmasa, yozuv ustidan yozilmaydi — `sync.conflicts` ga tushadi.
- `sync.ownership_rules` har bir ma'lumot turi uchun asosiy yozuvchi darajani belgilaydi; `allow_higher_levels`
  yuqori darajalarga ham yozishga ruxsat beradi (masalan, viloyat tumanga topshiriq beradi, lekin KPI
  natijasini faqat tuman kiritadi).

## Testlar

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres scripts/test-db.sh
```

Tekshiriladi: doirasiz so'rov hech narsa ko'rmaydi; tumanlararo sizish yo'q; maxfiylik darajasi;
boshqa hudud nomidan yozish taqiqlangan; audit append-only va zanjir butun; takroriy sync hodisasi
rad etiladi; versiya oshadi.

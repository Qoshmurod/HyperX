-- Modullar uchun kengaytma: grant-asosidagi RLS, qaror loyihalari, prognozlar, bildirishnomalar,
-- integratsiya shlyuzi, hujjat indekslash holati va tugunlararo sinxronizatsiya.

BEGIN;

-- ---------------------------------------------------------------------------
-- RLS: bitta hudud o'rniga foydalanuvchining barcha grantlari
-- ---------------------------------------------------------------------------
-- API har bir tranzaksiyada o'rnatadi:
--   SET LOCAL app.grants = '[{"p":"demo.v1.t1","c":"internal"},{"p":"demo.v2","c":"public"}]';
-- Har bir grant o'z hududi va o'z maxfiylik darajasi bilan baholanadi (aralashtirilmaydi).

CREATE FUNCTION app.grant_list() RETURNS TABLE (path ltree, max_c app.classification)
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT (g->>'p')::ltree, (g->>'c')::app.classification
    FROM jsonb_array_elements(COALESCE(NULLIF(current_setting('app.grants', true), ''), '[]')::jsonb) g
$$;

CREATE FUNCTION app.visible(org_id UUID, cls app.classification) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM organization.organizations o
        JOIN organization.administrative_units u ON u.id = o.administrative_unit_id
        JOIN app.grant_list() g ON u.path <@ g.path AND cls <= g.max_c
        WHERE o.id = org_id
    )
$$;

CREATE FUNCTION app.path_visible(p ltree) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (SELECT 1 FROM app.grant_list() g WHERE p <@ g.path)
$$;

CREATE OR REPLACE FUNCTION app.org_visible(org_id UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT app.visible(org_id, 'public')
$$;

DROP POLICY tasks_scope ON core.tasks;
CREATE POLICY tasks_scope ON core.tasks
    USING (app.visible(organization_id, classification))
    WITH CHECK (app.visible(organization_id, classification));

DROP POLICY documents_scope ON core.documents;
CREATE POLICY documents_scope ON core.documents
    USING (app.visible(organization_id, classification))
    WITH CHECK (app.visible(organization_id, classification));

DROP POLICY reports_scope ON core.reports;
CREATE POLICY reports_scope ON core.reports
    USING (app.visible(organization_id, classification))
    WITH CHECK (app.visible(organization_id, classification));

DROP FUNCTION app.max_classification();
DROP FUNCTION app.scope_path();

-- Hududlar ro'yxati ham doira bo'yicha (yuqori darajadagi hudud ko'rinmaydi).
ALTER TABLE organization.administrative_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY units_scope ON organization.administrative_units
    USING (app.path_visible(path)) WITH CHECK (app.path_visible(path));

ALTER TABLE organization.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_scope ON organization.departments
    USING (app.org_visible(organization_id)) WITH CHECK (app.org_visible(organization_id));

-- Sinxronizatsiya aniq versiyani yozishi uchun: version qo'lda o'zgartirilmagan bo'lsagina oshiriladi.
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    IF NEW.version = OLD.version THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- iam.users — Keycloak hisobiga birinchi kirishda bog'lash uchun login
-- ---------------------------------------------------------------------------
-- Administrator xodimni `username` bilan yaratadi; external_auth_id = 'pending:<username>'.
-- Xodim birinchi marta kirganda u Keycloak `sub` qiymatiga almashtiriladi.

ALTER TABLE iam.users ADD COLUMN username VARCHAR(100);
UPDATE iam.users SET username = external_auth_id WHERE username IS NULL;
ALTER TABLE iam.users ALTER COLUMN username SET NOT NULL;
ALTER TABLE iam.users ADD CONSTRAINT users_username_key UNIQUE (username);

-- ---------------------------------------------------------------------------
-- core.tasks — qo'shimcha maydonlar
-- ---------------------------------------------------------------------------

ALTER TABLE core.tasks ADD COLUMN department_id UUID REFERENCES organization.departments(id);
CREATE INDEX tasks_department_idx ON core.tasks (department_id);

-- ---------------------------------------------------------------------------
-- Decision Intelligence
-- ---------------------------------------------------------------------------

CREATE TABLE core.decision_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    title           VARCHAR(500) NOT NULL,
    problem         TEXT NOT NULL,
    analysis        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- sabablar, dalillar, manbalar
    options         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- variantlar: ta'sir, xavf, cheklov
    selected_option INTEGER,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'under_review', 'approved', 'rejected')),
    classification  app.classification NOT NULL DEFAULT 'internal',
    ai_run_id       UUID REFERENCES ai.ai_runs(id),
    created_by      UUID NOT NULL REFERENCES iam.users(id),
    reviewed_by     UUID REFERENCES iam.users(id),
    reviewed_at     TIMESTAMPTZ,
    review_note     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INTEGER NOT NULL DEFAULT 1,
    -- Tasdiqlash/rad etish faqat inson tomonidan, sana va mas'ul bilan.
    CHECK ((status IN ('approved', 'rejected')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CHECK (status <> 'approved' OR selected_option IS NOT NULL)
);
CREATE INDEX decision_drafts_org_idx ON core.decision_drafts (organization_id, created_at DESC);
CREATE INDEX decision_drafts_created_by_idx ON core.decision_drafts (created_by);
CREATE INDEX decision_drafts_reviewed_by_idx ON core.decision_drafts (reviewed_by);
CREATE INDEX decision_drafts_ai_run_idx ON core.decision_drafts (ai_run_id);
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON core.decision_drafts
    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE core.decision_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_drafts_scope ON core.decision_drafts
    USING (app.visible(organization_id, classification))
    WITH CHECK (app.visible(organization_id, classification));

-- ---------------------------------------------------------------------------
-- Forecast
-- ---------------------------------------------------------------------------

CREATE TABLE analytics.forecasts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization.organizations(id),
    kpi_definition_id   UUID REFERENCES analytics.kpi_definitions(id),
    ai_run_id           UUID REFERENCES ai.ai_runs(id),
    method              VARCHAR(50) NOT NULL,
    horizon             INTEGER NOT NULL CHECK (horizon > 0),
    points              JSONB NOT NULL,     -- [{period, value, lower, upper}]
    metrics             JSONB NOT NULL,     -- {mae, mape, holdout}
    scenario            JSONB,              -- ssenariy parametrlari
    created_by          UUID NOT NULL REFERENCES iam.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX forecasts_org_idx ON analytics.forecasts (organization_id, created_at DESC);
CREATE INDEX forecasts_kpi_idx ON analytics.forecasts (kpi_definition_id);
CREATE INDEX forecasts_ai_run_idx ON analytics.forecasts (ai_run_id);
CREATE INDEX forecasts_created_by_idx ON analytics.forecasts (created_by);
ALTER TABLE analytics.forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY forecasts_scope ON analytics.forecasts
    USING (app.org_visible(organization_id)) WITH CHECK (app.org_visible(organization_id));

-- ---------------------------------------------------------------------------
-- Notification Center
-- ---------------------------------------------------------------------------

CREATE TABLE core.notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organization.organizations(id),
    kind            VARCHAR(50) NOT NULL,   -- deadline, overdue, system_error, ai_finding, decision, report
    severity        VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title           VARCHAR(500) NOT NULL,
    body            TEXT,
    link            VARCHAR(1024),
    dedupe_key      VARCHAR(255) UNIQUE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON core.notifications (user_id, created_at DESC);
CREATE INDEX notifications_org_idx ON core.notifications (organization_id);

CREATE TABLE core.notification_preferences (
    user_id             UUID PRIMARY KEY REFERENCES iam.users(id) ON DELETE CASCADE,
    email_enabled       BOOLEAN NOT NULL DEFAULT true,
    telegram_enabled    BOOLEAN NOT NULL DEFAULT false,
    telegram_chat_id    VARCHAR(64),
    min_severity        VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (min_severity IN ('info', 'warning', 'critical')),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE core.notification_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES core.notifications(id) ON DELETE CASCADE,
    channel         VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'telegram')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT,
    sent_at         TIMESTAMPTZ,
    UNIQUE (notification_id, channel)
);
CREATE INDEX notification_deliveries_due_idx ON core.notification_deliveries (next_attempt_at)
    WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Integration Gateway
-- ---------------------------------------------------------------------------

CREATE TABLE integration.api_clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    name            VARCHAR(255) NOT NULL,
    key_prefix      VARCHAR(16) NOT NULL,
    key_hash        CHAR(64) NOT NULL UNIQUE,   -- sha256(key); kalitning o'zi saqlanmaydi
    permissions     TEXT[] NOT NULL,
    max_classification app.classification NOT NULL DEFAULT 'internal',
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    last_used_at    TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES iam.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX api_clients_org_idx ON integration.api_clients (organization_id);
CREATE INDEX api_clients_created_by_idx ON integration.api_clients (created_by);

CREATE TABLE integration.webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    url             VARCHAR(1024) NOT NULL,
    events          TEXT[] NOT NULL,
    secret_enc      TEXT NOT NULL,          -- AES-256-GCM bilan shifrlangan imzo kaliti
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID NOT NULL REFERENCES iam.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhooks_org_idx ON integration.webhooks (organization_id);
CREATE INDEX webhooks_created_by_idx ON integration.webhooks (created_by);

CREATE TABLE integration.webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID NOT NULL REFERENCES integration.webhooks(id) ON DELETE CASCADE,
    event_id        UUID NOT NULL DEFAULT gen_random_uuid(),
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    response_status INTEGER,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at    TIMESTAMPTZ,
    UNIQUE (webhook_id, event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON integration.webhook_deliveries (next_attempt_at)
    WHERE status = 'pending';

CREATE TABLE integration.import_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    kind            VARCHAR(50) NOT NULL CHECK (kind IN ('tasks', 'kpi_measurements')),
    format          VARCHAR(10) NOT NULL CHECK (format IN ('csv', 'xlsx', 'json')),
    status          VARCHAR(20) NOT NULL CHECK (status IN ('completed', 'partial', 'failed')),
    total           INTEGER NOT NULL DEFAULT 0,
    succeeded       INTEGER NOT NULL DEFAULT 0,
    failed          INTEGER NOT NULL DEFAULT 0,
    errors          JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by      UUID REFERENCES iam.users(id),
    api_client_id   UUID REFERENCES integration.api_clients(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX import_jobs_org_idx ON integration.import_jobs (organization_id, created_at DESC);
CREATE INDEX import_jobs_created_by_idx ON integration.import_jobs (created_by);
CREATE INDEX import_jobs_client_idx ON integration.import_jobs (api_client_id);

-- ---------------------------------------------------------------------------
-- Hujjatlar (RAG) holati
-- ---------------------------------------------------------------------------

ALTER TABLE core.documents
    ADD COLUMN index_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (index_status IN ('pending', 'indexed', 'failed')),
    ADD COLUMN chunk_count INTEGER,
    ADD COLUMN index_error TEXT,
    ADD COLUMN indexed_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Sinxronizatsiya: tugunlar, tartib raqami va kursorlar
-- ---------------------------------------------------------------------------

CREATE TABLE sync.nodes (
    node_id         VARCHAR(100) PRIMARY KEY,
    level           VARCHAR(20) NOT NULL CHECK (level IN ('central', 'region', 'district')),
    admin_unit_path LTREE NOT NULL,
    token_hash      CHAR(64) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sync.sync_events
    ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY,
    ADD COLUMN admin_unit_path LTREE;
CREATE UNIQUE INDEX sync_events_seq_idx ON sync.sync_events (seq);
CREATE INDEX sync_events_path_gist ON sync.sync_events USING gist (admin_unit_path);

CREATE TABLE sync.cursors (
    upstream_url    VARCHAR(1024) PRIMARY KEY,
    last_seq        BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sync.inbox_events DROP CONSTRAINT inbox_events_outcome_check;
ALTER TABLE sync.inbox_events ADD CONSTRAINT inbox_events_outcome_check
    CHECK (outcome IN ('applied', 'conflict', 'rejected', 'skipped'));
ALTER TABLE sync.inbox_events ADD COLUMN detail TEXT;

-- ---------------------------------------------------------------------------
-- Huquqlar
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'govmind_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam, organization, core, analytics, ai, integration, sync TO govmind_app;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO govmind_app;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'govmind_auditor') THEN
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO govmind_auditor;
        GRANT USAGE ON SCHEMA iam TO govmind_auditor;
        GRANT SELECT ON iam.users TO govmind_auditor;
    END IF;
END $$;

COMMIT;

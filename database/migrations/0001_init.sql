-- GovMind AI — boshlang'ich sxema (Phase 0/1)
-- Ushbu migratsiya ma'lumotlar bazasi egasi (owner) nomidan bajariladi.
-- Ilova esa `govmind_app` roli bilan ulanadi: u jadval egasi emas, shuning uchun RLS unga qo'llanadi.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS sync;

-- ---------------------------------------------------------------------------
-- Umumiy turlar va yordamchi funksiyalar
-- ---------------------------------------------------------------------------

-- Ma'lumot maxfiylik darajasi (tartib muhim: kichikdan kattaga).
CREATE TYPE app.classification AS ENUM ('public', 'internal', 'confidential', 'secret');

-- Joriy so'rov vakolat doirasi. API har bir tranzaksiya boshida o'rnatadi:
--   SET LOCAL app.scope_path = 'uz.toshkent_v.chirchiq';    -- foydalanuvchi ko'ra oladigan hudud
--   SET LOCAL app.max_classification = 'internal';
-- O'rnatilmagan bo'lsa — hech narsa ko'rinmaydi (deny by default).
CREATE FUNCTION app.scope_path() RETURNS ltree
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.scope_path', true), '')::ltree
$$;

CREATE FUNCTION app.max_classification() RETURNS app.classification
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('app.max_classification', true), ''), 'public')::app.classification
$$;

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    NEW.version := OLD.version + 1;
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- organization
-- ---------------------------------------------------------------------------

CREATE TABLE organization.administrative_units (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id   UUID REFERENCES organization.administrative_units(id),
    level       VARCHAR(20) NOT NULL CHECK (level IN ('republic', 'region', 'district')),
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(100) NOT NULL UNIQUE,
    -- Iyerarxiya yo'li, masalan: uz.toshkent_v.chirchiq
    path        LTREE NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    version     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX administrative_units_path_gist ON organization.administrative_units USING gist (path);
CREATE INDEX administrative_units_parent_idx ON organization.administrative_units (parent_id);

CREATE TABLE organization.organizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id           UUID REFERENCES organization.organizations(id),
    administrative_unit_id UUID NOT NULL REFERENCES organization.administrative_units(id),
    name                VARCHAR(255) NOT NULL,
    code                VARCHAR(100) NOT NULL UNIQUE,
    organization_type   VARCHAR(50) NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'archived')),
    -- Tashkilot yozuvining asosiy yozuvchi tuguni (sync uchun)
    owner_node_id       VARCHAR(100) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX organizations_parent_idx ON organization.organizations (parent_id);
CREATE INDEX organizations_admin_unit_idx ON organization.organizations (administrative_unit_id);

CREATE TABLE organization.departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    parent_id       UUID REFERENCES organization.departments(id),
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX departments_org_idx ON organization.departments (organization_id);

-- Tashkilot qaysi hududga tegishli ekanini RLS uchun aniqlaydi.
CREATE FUNCTION app.org_visible(org_id UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1
        FROM organization.organizations o
        JOIN organization.administrative_units u ON u.id = o.administrative_unit_id
        WHERE o.id = org_id
          AND app.scope_path() IS NOT NULL
          AND u.path <@ app.scope_path()
    )
$$;

-- ---------------------------------------------------------------------------
-- iam
-- ---------------------------------------------------------------------------

CREATE TABLE iam.users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_auth_id    VARCHAR(255) NOT NULL UNIQUE,  -- Keycloak subject
    full_name           VARCHAR(255) NOT NULL,
    email               VARCHAR(255),
    status              VARCHAR(30) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'locked', 'disabled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    version             INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE iam.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    is_system   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE iam.permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(150) NOT NULL UNIQUE,   -- masalan: tasks.read, reports.export
    description TEXT
);

CREATE TABLE iam.role_permissions (
    role_id         UUID NOT NULL REFERENCES iam.roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES iam.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_idx ON iam.role_permissions (permission_id);

-- Rol har doim aniq hudud doirasida beriladi (ABAC: hudud + maxfiylik darajasi + muddat).
CREATE TABLE iam.user_roles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    role_id                 UUID NOT NULL REFERENCES iam.roles(id),
    administrative_unit_id  UUID NOT NULL REFERENCES organization.administrative_units(id),
    max_classification      app.classification NOT NULL DEFAULT 'internal',
    valid_from              TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until             TIMESTAMPTZ,
    granted_by              UUID REFERENCES iam.users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role_id, administrative_unit_id),
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX user_roles_role_idx ON iam.user_roles (role_id);
CREATE INDEX user_roles_unit_idx ON iam.user_roles (administrative_unit_id);

CREATE TABLE iam.organization_memberships (
    user_id         UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    department_id   UUID REFERENCES organization.departments(id),
    position        VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, organization_id)
);
CREATE INDEX organization_memberships_org_idx ON iam.organization_memberships (organization_id);
CREATE INDEX organization_memberships_dept_idx ON iam.organization_memberships (department_id);

-- ---------------------------------------------------------------------------
-- core
-- ---------------------------------------------------------------------------

CREATE TABLE core.tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    priority        VARCHAR(30) NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    status          VARCHAR(30) NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'in_progress', 'done', 'cancelled')),
    classification  app.classification NOT NULL DEFAULT 'internal',
    deadline        TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_by      UUID NOT NULL REFERENCES iam.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INTEGER NOT NULL DEFAULT 1,
    CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
CREATE INDEX tasks_org_status_deadline_idx ON core.tasks (organization_id, status, deadline);
CREATE INDEX tasks_created_by_idx ON core.tasks (created_by);

CREATE TABLE core.task_assignments (
    task_id     UUID NOT NULL REFERENCES core.tasks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES iam.users(id),
    role        VARCHAR(30) NOT NULL DEFAULT 'responsible'
                CHECK (role IN ('responsible', 'co_executor', 'controller')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, user_id)
);
CREATE INDEX task_assignments_user_idx ON core.task_assignments (user_id);

CREATE TABLE core.documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    title           VARCHAR(500) NOT NULL,
    object_key      VARCHAR(1024) NOT NULL,     -- MinIO obyekt kaliti
    mime_type       VARCHAR(150) NOT NULL,
    sha256          CHAR(64) NOT NULL,
    page_count      INTEGER,
    classification  app.classification NOT NULL DEFAULT 'internal',
    uploaded_by     UUID NOT NULL REFERENCES iam.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX documents_org_idx ON core.documents (organization_id);
CREATE INDEX documents_uploaded_by_idx ON core.documents (uploaded_by);

CREATE TABLE core.reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    report_type     VARCHAR(30) NOT NULL
                    CHECK (report_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'custom')),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'review', 'approved', 'archived')),
    content         JSONB NOT NULL DEFAULT '{}'::jsonb,
    ai_run_id       UUID,  -- FK pastda (ai.ai_runs yaratilgach)
    classification  app.classification NOT NULL DEFAULT 'internal',
    created_by      UUID NOT NULL REFERENCES iam.users(id),
    approved_by     UUID REFERENCES iam.users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INTEGER NOT NULL DEFAULT 1,
    CHECK (period_end >= period_start)
);
CREATE INDEX reports_org_period_idx ON core.reports (organization_id, period_start);
CREATE INDEX reports_created_by_idx ON core.reports (created_by);
CREATE INDEX reports_approved_by_idx ON core.reports (approved_by);

-- ---------------------------------------------------------------------------
-- analytics
-- ---------------------------------------------------------------------------

CREATE TABLE analytics.kpi_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    code            VARCHAR(100) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    unit            VARCHAR(50),
    direction       VARCHAR(10) NOT NULL CHECK (direction IN ('higher', 'lower')),
    period          VARCHAR(20) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, code)
);

CREATE TABLE analytics.kpi_measurements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kpi_definition_id   UUID NOT NULL REFERENCES analytics.kpi_definitions(id),
    organization_id     UUID NOT NULL REFERENCES organization.organizations(id),
    period_start        DATE NOT NULL,
    planned_value       NUMERIC(18,4),
    actual_value        NUMERIC(18,4),
    source              VARCHAR(255) NOT NULL,  -- ma'lumot manbasi (izohlanuvchanlik uchun)
    recorded_by         UUID REFERENCES iam.users(id),
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kpi_definition_id, period_start)
);
CREATE INDEX kpi_measurements_org_period_idx ON analytics.kpi_measurements (organization_id, period_start);
CREATE INDEX kpi_measurements_recorded_by_idx ON analytics.kpi_measurements (recorded_by);

-- ---------------------------------------------------------------------------
-- ai
-- ---------------------------------------------------------------------------

CREATE TABLE ai.ai_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    user_id         UUID NOT NULL REFERENCES iam.users(id),
    title           VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_user_idx ON ai.ai_conversations (user_id, created_at DESC);
CREATE INDEX ai_conversations_org_idx ON ai.ai_conversations (organization_id);

CREATE TABLE ai.ai_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    user_id         UUID NOT NULL REFERENCES iam.users(id),
    model_name      VARCHAR(255) NOT NULL,
    model_version   VARCHAR(100) NOT NULL,
    runtime         VARCHAR(20) NOT NULL CHECK (runtime IN ('local', 'central')),
    task_type       VARCHAR(100) NOT NULL,
    input_hash      VARCHAR(128) NOT NULL,
    status          VARCHAR(30) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'rejected')),
    result          JSONB,
    confidence      NUMERIC(5,4) CHECK (confidence BETWEEN 0 AND 1),
    prompt_tokens   INTEGER,
    output_tokens   INTEGER,
    error_code      VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
CREATE INDEX ai_runs_org_created_idx ON ai.ai_runs (organization_id, created_at DESC);
CREATE INDEX ai_runs_user_idx ON ai.ai_runs (user_id);

CREATE TABLE ai.ai_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai.ai_conversations(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    ai_run_id       UUID REFERENCES ai.ai_runs(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_idx ON ai.ai_messages (conversation_id, created_at);
CREATE INDEX ai_messages_run_idx ON ai.ai_messages (ai_run_id);

-- Har bir AI xulosasi qaysi manbaga tayanganini saqlaydi.
CREATE TABLE ai.ai_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_run_id       UUID NOT NULL REFERENCES ai.ai_runs(id) ON DELETE CASCADE,
    source_type     VARCHAR(30) NOT NULL CHECK (source_type IN ('document', 'query', 'kpi', 'task')),
    document_id     UUID REFERENCES core.documents(id),
    page_number     INTEGER,
    query_code      VARCHAR(150),     -- read-only query katalogidagi so'rov kodi
    excerpt         TEXT,
    score           NUMERIC(6,5),
    CHECK (source_type <> 'document' OR document_id IS NOT NULL),
    CHECK (source_type <> 'query' OR query_code IS NOT NULL)
);
CREATE INDEX ai_sources_run_idx ON ai.ai_sources (ai_run_id);
CREATE INDEX ai_sources_document_idx ON ai.ai_sources (document_id);

ALTER TABLE core.reports
    ADD CONSTRAINT reports_ai_run_fk FOREIGN KEY (ai_run_id) REFERENCES ai.ai_runs(id);
CREATE INDEX reports_ai_run_idx ON core.reports (ai_run_id);

-- ---------------------------------------------------------------------------
-- audit — append-only, xesh-zanjir bilan himoyalangan
-- ---------------------------------------------------------------------------

CREATE TABLE audit.audit_events (
    seq             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id              UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    organization_id UUID,
    actor_id        UUID,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(100),
    resource_id     UUID,
    event_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address      INET,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    prev_hash       CHAR(64) NOT NULL,
    hash            CHAR(64) NOT NULL
);
CREATE INDEX audit_events_org_time_idx ON audit.audit_events (organization_id, occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON audit.audit_events (actor_id, occurred_at DESC);

-- Xesh hisoblash: vaqt UTC formatida, sessiya TimeZone sozlamasiga bog'liq emas.
CREATE FUNCTION audit.event_hash(e audit.audit_events) RETURNS CHAR(64)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
    SELECT encode(digest(
        e.prev_hash || '|' || e.id::text || '|' ||
        COALESCE(e.organization_id::text, '') || '|' || COALESCE(e.actor_id::text, '') || '|' ||
        e.action || '|' || COALESCE(e.resource_type, '') || '|' ||
        COALESCE(e.resource_id::text, '') || '|' || e.event_data::text || '|' ||
        to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        'sha256'), 'hex')::CHAR(64)
$$;

-- SECURITY DEFINER: ilova roli audit jadvalini o'qiy olmaydi, lekin zanjir uchun oxirgi xesh kerak.
CREATE FUNCTION audit.chain_hash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    last_hash CHAR(64);
BEGIN
    -- Zanjirni ketma-ket qurish uchun parallel yozuvlarni tartiblaymiz.
    PERFORM pg_advisory_xact_lock(hashtext('audit.audit_events'));
    SELECT a.hash INTO last_hash FROM audit.audit_events a ORDER BY a.seq DESC LIMIT 1;
    NEW.prev_hash := COALESCE(last_hash, repeat('0', 64));
    NEW.occurred_at := now();
    NEW.hash := audit.event_hash(NEW);
    RETURN NEW;
END $$;

CREATE TRIGGER audit_events_chain BEFORE INSERT ON audit.audit_events
    FOR EACH ROW EXECUTE FUNCTION audit.chain_hash();

CREATE FUNCTION audit.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit.audit_events is append-only (% rejected)', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit.audit_events
    FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit.audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();

-- Zanjir butunligini tekshirish: buzilgan birinchi yozuv seq raqamini qaytaradi (NULL = butun).
-- SECURITY DEFINER: tekshiruv RLS doirasidan qat'i nazar butun zanjirni ko'rishi kerak.
CREATE FUNCTION audit.verify_chain() RETURNS BIGINT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    r audit.audit_events;
    expected_prev CHAR(64) := repeat('0', 64);
BEGIN
    FOR r IN SELECT * FROM audit.audit_events ORDER BY seq LOOP
        IF r.prev_hash <> expected_prev OR r.hash <> audit.event_hash(r) THEN
            RETURN r.seq;
        END IF;
        expected_prev := r.hash;
    END LOOP;
    RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION audit.verify_chain() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- integration
-- ---------------------------------------------------------------------------

CREATE TABLE integration.integration_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization.organizations(id),
    code            VARCHAR(100) NOT NULL,
    kind            VARCHAR(30) NOT NULL CHECK (kind IN ('rest', 'webhook', 'file_import', 'file_export')),
    endpoint_url    VARCHAR(1024),
    -- Maxfiy kalitning o'zi emas, secrets manager'dagi havola saqlanadi.
    secret_ref      VARCHAR(255),
    api_version     VARCHAR(20),
    enabled         BOOLEAN NOT NULL DEFAULT false,
    settings        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    version         INTEGER NOT NULL DEFAULT 1,
    UNIQUE (organization_id, code)
);

-- ---------------------------------------------------------------------------
-- sync — Outbox/Inbox, versiyalar, konfliktlar
-- ---------------------------------------------------------------------------

-- Qaysi ma'lumot turi uchun qaysi tugun darajasi asosiy yozuvchi.
CREATE TABLE sync.ownership_rules (
    resource_type   VARCHAR(100) PRIMARY KEY,
    owner_level     VARCHAR(20) NOT NULL CHECK (owner_level IN ('central', 'region', 'district')),
    description     TEXT
);

-- Outbox: biznes o'zgarishi bilan BITTA tranzaksiyada yoziladi.
CREATE TABLE sync.sync_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id  VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(100) NOT NULL,
    resource_id     UUID NOT NULL,
    operation       VARCHAR(10) NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    base_version    INTEGER,          -- o'zgarish qaysi versiya ustiga qilingani
    new_version     INTEGER NOT NULL,
    payload         JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'acknowledged', 'failed', 'conflict')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sync_events_dispatch_idx ON sync.sync_events (next_attempt_at)
    WHERE status IN ('pending', 'failed');
CREATE INDEX sync_events_resource_idx ON sync.sync_events (resource_type, resource_id);

-- Inbox: event_id PRIMARY KEY takroriy hodisani ikki marta qo'llashni imkonsiz qiladi.
CREATE TABLE sync.inbox_events (
    event_id        UUID PRIMARY KEY,
    source_node_id  VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(100) NOT NULL,
    resource_id     UUID NOT NULL,
    outcome         VARCHAR(20) NOT NULL CHECK (outcome IN ('applied', 'conflict', 'rejected')),
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sync.conflicts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES sync.inbox_events(event_id),
    resource_type   VARCHAR(100) NOT NULL,
    resource_id     UUID NOT NULL,
    local_version   INTEGER,
    incoming_base_version INTEGER,
    local_payload   JSONB,
    incoming_payload JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'resolved_local', 'resolved_incoming', 'resolved_merged')),
    resolved_by     UUID REFERENCES iam.users(id),
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'open') = (resolved_at IS NULL))
);
CREATE INDEX conflicts_open_idx ON sync.conflicts (created_at) WHERE status = 'open';
CREATE INDEX conflicts_event_idx ON sync.conflicts (event_id);
CREATE INDEX conflicts_resolved_by_idx ON sync.conflicts (resolved_by);

-- ---------------------------------------------------------------------------
-- updated_at / version triggerlari
-- ---------------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'organization.administrative_units', 'organization.organizations', 'organization.departments',
        'iam.users', 'core.tasks', 'core.documents', 'core.reports', 'integration.integration_configs'
    ] LOOP
        EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %s
                        FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security: tashkilot/hudud va maxfiylik darajasi bo'yicha ajratish
-- ---------------------------------------------------------------------------

ALTER TABLE organization.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_scope ON organization.organizations
    USING (app.org_visible(id));

ALTER TABLE core.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_scope ON core.tasks
    USING (app.org_visible(organization_id) AND classification <= app.max_classification())
    WITH CHECK (app.org_visible(organization_id) AND classification <= app.max_classification());

ALTER TABLE core.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_scope ON core.documents
    USING (app.org_visible(organization_id) AND classification <= app.max_classification())
    WITH CHECK (app.org_visible(organization_id) AND classification <= app.max_classification());

ALTER TABLE core.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_scope ON core.reports
    USING (app.org_visible(organization_id) AND classification <= app.max_classification())
    WITH CHECK (app.org_visible(organization_id) AND classification <= app.max_classification());

ALTER TABLE analytics.kpi_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY kpi_definitions_scope ON analytics.kpi_definitions
    USING (app.org_visible(organization_id)) WITH CHECK (app.org_visible(organization_id));

ALTER TABLE analytics.kpi_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY kpi_measurements_scope ON analytics.kpi_measurements
    USING (app.org_visible(organization_id)) WITH CHECK (app.org_visible(organization_id));

ALTER TABLE ai.ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_runs_scope ON ai.ai_runs
    USING (app.org_visible(organization_id)) WITH CHECK (app.org_visible(organization_id));

ALTER TABLE ai.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_conversations_scope ON ai.ai_conversations
    USING (app.org_visible(organization_id)) WITH CHECK (app.org_visible(organization_id));

-- Audit: ilova faqat yoza oladi; o'qish faqat auditor roli orqali (alohida DB rol).
ALTER TABLE audit.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON audit.audit_events FOR INSERT WITH CHECK (true);
CREATE POLICY audit_read_scope ON audit.audit_events FOR SELECT
    USING (organization_id IS NULL OR app.org_visible(organization_id));

-- ---------------------------------------------------------------------------
-- Ilova rollari uchun huquqlar (rollar infrastructure/postgres/init da yaratiladi)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'govmind_app') THEN
        GRANT USAGE ON SCHEMA app, iam, organization, core, analytics, ai, audit, integration, sync TO govmind_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam, organization, core, analytics, ai, integration, sync TO govmind_app;
        -- Audit: faqat INSERT. UPDATE/DELETE/TRUNCATE berilmaydi.
        GRANT INSERT ON audit.audit_events TO govmind_app;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO govmind_app;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'govmind_auditor') THEN
        GRANT USAGE ON SCHEMA app, audit TO govmind_auditor;
        GRANT SELECT ON audit.audit_events TO govmind_auditor;
        GRANT EXECUTE ON FUNCTION audit.verify_chain() TO govmind_auditor;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO govmind_auditor;
    END IF;
END $$;

COMMIT;

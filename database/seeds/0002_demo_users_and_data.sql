-- FAQAT SINTETIK demo ma'lumotlar: foydalanuvchilar Keycloak demo realm'idagi hisoblarga mos
-- (infrastructure/keycloak/govmind-realm.json). Production'da GOVMIND_LOAD_SEEDS=false.
BEGIN;

INSERT INTO iam.users (id, external_auth_id, username, full_name, email) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'superadmin',     'Demo Super Admin',      'superadmin@demo.local'),
    ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'viloyat.rahbar', 'Demo Viloyat Rahbari',  'viloyat@demo.local'),
    ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'tuman.rahbar',   'Demo Tuman Rahbari',    'tuman1@demo.local'),
    ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'tuman.analitik', 'Demo Analitik',         'analitik@demo.local'),
    ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005', 'tuman.xodim',    'Demo Xodim',            'xodim@demo.local'),
    ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000006', 'auditor',        'Demo Auditor',          'auditor@demo.local'),
    ('a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000007', 'tuman2.rahbar',  'Demo 2-tuman Rahbari',  'tuman2@demo.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.user_roles (user_id, role_id, administrative_unit_id, max_classification)
SELECT u.id::uuid, r.id, a.id::uuid, u.cls::app.classification
FROM (VALUES
    ('a0000000-0000-0000-0000-000000000001', 'super_admin', '00000000-0000-0000-0000-000000000001', 'secret'),
    ('a0000000-0000-0000-0000-000000000002', 'leader',      '00000000-0000-0000-0000-000000000010', 'confidential'),
    ('a0000000-0000-0000-0000-000000000002', 'region_admin','00000000-0000-0000-0000-000000000010', 'confidential'),
    ('a0000000-0000-0000-0000-000000000003', 'leader',      '00000000-0000-0000-0000-000000000101', 'confidential'),
    ('a0000000-0000-0000-0000-000000000003', 'district_admin','00000000-0000-0000-0000-000000000101', 'confidential'),
    ('a0000000-0000-0000-0000-000000000004', 'analyst',     '00000000-0000-0000-0000-000000000101', 'internal'),
    ('a0000000-0000-0000-0000-000000000005', 'employee',    '00000000-0000-0000-0000-000000000101', 'internal'),
    ('a0000000-0000-0000-0000-000000000006', 'auditor',     '00000000-0000-0000-0000-000000000001', 'internal'),
    ('a0000000-0000-0000-0000-000000000007', 'leader',      '00000000-0000-0000-0000-000000000102', 'confidential')
) AS u(id, role, unit, cls)
JOIN iam.roles r ON r.code = u.role
JOIN (SELECT id::text AS id FROM organization.administrative_units) a ON a.id = u.unit
ON CONFLICT DO NOTHING;

INSERT INTO iam.organization_memberships (user_id, organization_id, position) VALUES
    ('a0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000101', 'Hokim'),
    ('a0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000101', 'Bosh mutaxassis'),
    ('a0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000101', 'Mutaxassis'),
    ('a0000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000102', 'Hokim')
ON CONFLICT DO NOTHING;

INSERT INTO organization.departments (id, organization_id, name) VALUES
    ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101', 'Iqtisodiyot bo''limi'),
    ('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000101', 'Ijtimoiy soha bo''limi'),
    ('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000102', 'Iqtisodiyot bo''limi')
ON CONFLICT DO NOTHING;

-- Sintetik topshiriqlar: oxirgi 12 oy, ikkala tuman
INSERT INTO core.tasks (organization_id, department_id, title, priority, status, deadline, completed_at, created_by, created_at)
SELECT
    org,
    dep,
    format('Demo topshiriq #%s', n),
    (ARRAY['low','normal','normal','high','critical'])[1 + (n % 5)],
    st,
    dl,
    CASE WHEN st = 'done' THEN dl + make_interval(days => ((n * 7) % 11) - 6) END,
    'a0000000-0000-0000-0000-000000000003',
    dl - interval '20 days'
FROM (
    SELECT n,
        CASE WHEN n % 3 = 0 THEN '10000000-0000-0000-0000-000000000102'::uuid
             ELSE '10000000-0000-0000-0000-000000000101'::uuid END AS org,
        CASE WHEN n % 3 = 0 THEN '11000000-0000-0000-0000-000000000003'::uuid
             WHEN n % 2 = 0 THEN '11000000-0000-0000-0000-000000000001'::uuid
             ELSE '11000000-0000-0000-0000-000000000002'::uuid END AS dep,
        date_trunc('day', now()) - make_interval(days => 360 - n * 3) AS dl,
        CASE WHEN n > 115 THEN (ARRAY['new','in_progress'])[1 + n % 2]
             WHEN n % 9 = 0 THEN 'in_progress'
             WHEN n % 17 = 0 THEN 'cancelled'
             ELSE 'done' END AS st
    FROM generate_series(1, 130) n
) t;

INSERT INTO core.task_assignments (task_id, user_id)
SELECT id, CASE WHEN organization_id = '10000000-0000-0000-0000-000000000102'
                THEN 'a0000000-0000-0000-0000-000000000007'::uuid
                ELSE 'a0000000-0000-0000-0000-000000000005'::uuid END
FROM core.tasks ON CONFLICT DO NOTHING;

INSERT INTO analytics.kpi_definitions (id, organization_id, code, name, unit, direction, period) VALUES
    ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000101', 'murojaat', 'Ko''rib chiqilgan murojaatlar', 'dona', 'higher', 'monthly'),
    ('12000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000101', 'ish_orni', 'Yaratilgan ish o''rinlari', 'dona', 'higher', 'monthly'),
    ('12000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000102', 'murojaat', 'Ko''rib chiqilgan murojaatlar', 'dona', 'higher', 'monthly')
ON CONFLICT DO NOTHING;

-- 24 oylik sintetik qator: trend + mavsumiylik + deterministik shovqin
INSERT INTO analytics.kpi_measurements (kpi_definition_id, organization_id, period_start, planned_value, actual_value, source, recorded_by)
SELECT k.id, k.organization_id,
       (date_trunc('month', now()) - make_interval(months => 24 - m))::date,
       round(k.base + m * k.slope),
       round(k.base + m * k.slope + k.amp * sin(2 * pi() * m / 12) + ((m * 37) % 11 - 5) * k.noise
             - CASE WHEN m > 20 THEN k.dip ELSE 0 END),
       'demo-seed', 'a0000000-0000-0000-0000-000000000004'
FROM (VALUES
    ('12000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000101'::uuid, 400.0, 6.0, 60.0, 4.0, 90.0),
    ('12000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000101'::uuid, 50.0, 1.5, 12.0, 1.0, 0.0),
    ('12000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000102'::uuid, 300.0, 4.0, 40.0, 3.0, 0.0)
) AS k(id, organization_id, base, slope, amp, noise, dip)
CROSS JOIN generate_series(1, 24) m
ON CONFLICT DO NOTHING;

COMMIT;

-- FAQAT SINTETIK (o'ylab topilgan) ma'lumotlar. Haqiqiy davlat ma'lumotlari bu yerga qo'yilmaydi.
BEGIN;

INSERT INTO iam.roles (code, name, is_system) VALUES
    ('super_admin',    'Super Admin', true),
    ('republic_admin', 'Respublika Admin', true),
    ('region_admin',   'Viloyat Admin', true),
    ('district_admin', 'Tuman Admin', true),
    ('leader',         'Rahbar', true),
    ('analyst',        'Analitik', true),
    ('employee',       'Xodim', true),
    ('auditor',        'Auditor', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO iam.permissions (code, description) VALUES
    ('organizations.read',   'Tashkilotlarni ko''rish'),
    ('organizations.manage', 'Tashkilotlarni boshqarish'),
    ('users.manage',         'Xodimlarni boshqarish'),
    ('roles.manage',         'Rollar va ruxsatlarni boshqarish'),
    ('tasks.read',           'Topshiriqlarni ko''rish'),
    ('tasks.manage',         'Topshiriqlarni boshqarish'),
    ('kpi.read',             'KPI ko''rish'),
    ('kpi.manage',           'KPI boshqarish'),
    ('reports.read',         'Hisobotlarni ko''rish'),
    ('reports.export',       'Hisobotlarni eksport qilish'),
    ('reports.approve',      'Hisobotlarni tasdiqlash'),
    ('ai.use',               'AI tahlil va suhbatdan foydalanish'),
    ('ai.forecast',          'Prognozlash'),
    ('decisions.approve',    'Qaror loyihalarini tasdiqlash'),
    ('audit.read',           'Audit yozuvlarini ko''rish'),
    ('sync.resolve',         'Sinxronizatsiya konfliktlarini hal qilish'),
    ('integrations.manage',  'Integratsiyalarni boshqarish'),
    ('decisions.create',     'Qaror loyihasini tayyorlash'),
    ('documents.read',       'Hujjatlarni ko''rish va qidirish'),
    ('documents.upload',     'Hujjat yuklash'),
    ('sync.manage',          'Tugunlar va sinxronizatsiyani boshqarish')
ON CONFLICT (code) DO NOTHING;

-- Rol → ruxsat matritsasi
INSERT INTO iam.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM iam.roles r JOIN iam.permissions p ON (
       r.code = 'super_admin'
    OR (r.code IN ('republic_admin', 'region_admin', 'district_admin') AND p.code NOT IN ('audit.read'))
    OR (r.code = 'leader'   AND p.code IN ('organizations.read','tasks.read','tasks.manage','kpi.read','reports.read','reports.export','reports.approve','ai.use','ai.forecast','decisions.create','decisions.approve','documents.read','documents.upload'))
    OR (r.code = 'analyst'  AND p.code IN ('organizations.read','tasks.read','kpi.read','kpi.manage','reports.read','reports.export','ai.use','ai.forecast','decisions.create','documents.read','documents.upload'))
    OR (r.code = 'employee' AND p.code IN ('organizations.read','tasks.read','kpi.read','reports.read','ai.use','documents.read'))
    OR (r.code = 'auditor'  AND p.code IN ('organizations.read','audit.read','reports.read'))
)
ON CONFLICT DO NOTHING;

INSERT INTO sync.ownership_rules (resource_type, owner_level, allow_higher_levels, description) VALUES
    ('organization.administrative_units', 'central',  false, 'Hududiy iyerarxiya faqat markazda yuritiladi'),
    ('iam.roles',                         'central',  false, 'Rollar katalogi markazda'),
    ('organization.organizations',        'region',   true,  'Tashkilotlarni viloyat (yoki markaz) ro''yxatga oladi'),
    ('core.tasks',                        'district', true,  'Topshiriqni tuman yaratadi; viloyat va markaz ham topshiriq bera oladi'),
    ('analytics.kpi_definitions',         'district', true,  'KPI ta''riflari tuman yoki yuqori darajada'),
    ('analytics.kpi_measurements',        'district', false, 'KPI natijalari faqat joyida kiritiladi'),
    ('core.reports',                      'district', true,  'Hisobotlar o''z darajasida tayyorlanadi')
ON CONFLICT (resource_type) DO UPDATE SET owner_level = EXCLUDED.owner_level,
    allow_higher_levels = EXCLUDED.allow_higher_levels, description = EXCLUDED.description;

-- Demo hududlar (sintetik)
INSERT INTO organization.administrative_units (id, parent_id, level, name, code, path) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'republic', 'Demo Respublika', 'DEMO', 'demo'),
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'region', 'Demo viloyati', 'DEMO-V1', 'demo.v1'),
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'district', 'Birinchi tuman', 'DEMO-V1-T1', 'demo.v1.t1'),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', 'district', 'Ikkinchi tuman', 'DEMO-V1-T2', 'demo.v1.t2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization.organizations (id, administrative_unit_id, name, code, organization_type, owner_node_id) VALUES
    ('10000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', 'Birinchi tuman hokimligi (demo)', 'DEMO-ORG-T1', 'hokimlik', 'node-demo-t1'),
    ('10000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000102', 'Ikkinchi tuman hokimligi (demo)', 'DEMO-ORG-T2', 'hokimlik', 'node-demo-t2')
ON CONFLICT (id) DO NOTHING;

COMMIT;

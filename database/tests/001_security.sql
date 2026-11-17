-- Xavfsizlik invariantlari testi. Migratsiya va seed'dan keyin superuser sifatida ishga tushiriladi.
-- Har qanday nosozlik EXCEPTION ko'taradi (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP 1
BEGIN;

INSERT INTO iam.users (id, external_auth_id, username, full_name)
VALUES ('20000000-0000-0000-0000-000000000001', 'test-subject-1', 'test.xodim', 'Test Xodim');

INSERT INTO core.tasks (organization_id, title, classification, created_by) VALUES
    ('10000000-0000-0000-0000-000000000101', 'T1 ichki topshiriq', 'internal', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000101', 'T1 maxfiy topshiriq', 'confidential', '20000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000102', 'T2 ichki topshiriq', 'internal', '20000000-0000-0000-0000-000000000001');

SET LOCAL ROLE govmind_app;

-- 1. Vakolat doirasi o'rnatilmagan => hech narsa ko'rinmaydi (deny by default)
DO $$ BEGIN
    IF (SELECT count(*) FROM core.tasks WHERE title LIKE 'T_ %') <> 0 THEN RAISE EXCEPTION 'FAIL: scope yo''q, lekin topshiriqlar ko''rindi'; END IF;
    IF (SELECT count(*) FROM organization.organizations) <> 0 THEN RAISE EXCEPTION 'FAIL: scope yo''q, lekin tashkilotlar ko''rindi'; END IF;
END $$;

-- 2. Tuman foydalanuvchisi faqat o'z tumanini ko'radi
SET LOCAL app.grants = '[{"p":"demo.v1.t1","c":"internal"}]';
DO $$ BEGIN
    IF (SELECT count(*) FROM core.tasks WHERE title LIKE 'T_ %') <> 1 THEN RAISE EXCEPTION 'FAIL: tuman doirasi noto''g''ri: %', (SELECT count(*) FROM core.tasks WHERE title LIKE 'T_ %'); END IF;
    IF EXISTS (SELECT 1 FROM core.tasks WHERE organization_id = '10000000-0000-0000-0000-000000000102') THEN
        RAISE EXCEPTION 'FAIL: boshqa tuman ma''lumoti sizdi'; END IF;
END $$;

-- 3. Maxfiylik darajasi oshganda maxfiy yozuv ham ko'rinadi
SET LOCAL app.grants = '[{"p":"demo.v1.t1","c":"confidential"}]';
DO $$ BEGIN
    IF (SELECT count(*) FROM core.tasks WHERE title LIKE 'T_ %') <> 2 THEN RAISE EXCEPTION 'FAIL: confidential daraja'; END IF;
END $$;

-- 4. Viloyat foydalanuvchisi barcha tumanlarni ko'radi
SET LOCAL app.grants = '[{"p":"demo.v1","c":"internal"}]';
DO $$ BEGIN
    IF (SELECT count(*) FROM core.tasks WHERE title LIKE 'T_ %') <> 2 THEN RAISE EXCEPTION 'FAIL: viloyat doirasi'; END IF;
END $$;

-- 5. Boshqa tuman nomidan yozish taqiqlangan (WITH CHECK)
SET LOCAL app.grants = '[{"p":"demo.v1.t1","c":"internal"}]';
DO $$ BEGIN
    BEGIN
        INSERT INTO core.tasks (organization_id, title, created_by)
        VALUES ('10000000-0000-0000-0000-000000000102', 'begona', '20000000-0000-0000-0000-000000000001');
        RAISE EXCEPTION 'FAIL: boshqa tumanga yozish o''tib ketdi';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

-- 5b. Grantlar aralashtirilmaydi: t1 da internal, t2 da secret => t1 dagi confidential ko'rinmaydi
SET LOCAL app.grants = '[{"p":"demo.v1.t1","c":"internal"},{"p":"demo.v1.t2","c":"secret"}]';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM core.tasks WHERE classification = 'confidential') THEN
        RAISE EXCEPTION 'FAIL: grantlar aralashib ketdi'; END IF;
    IF (SELECT count(*) FROM core.tasks WHERE title LIKE 'T_ %') <> 2 THEN RAISE EXCEPTION 'FAIL: ikki grant birlashmadi'; END IF;
END $$;

-- 5c. Tuman foydalanuvchisi viloyat/respublika hududini ko'rmaydi
SET LOCAL app.grants = '[{"p":"demo.v1.t1","c":"internal"}]';
DO $$ BEGIN
    IF (SELECT count(*) FROM organization.administrative_units) <> 1 THEN
        RAISE EXCEPTION 'FAIL: yuqori hududlar ko''rindi'; END IF;
END $$;

-- 6. Audit: ilova yoza oladi, lekin o'qiy/o'zgartira olmaydi
INSERT INTO audit.audit_events (organization_id, actor_id, action, resource_type)
VALUES ('10000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000001', 'task.view', 'core.tasks');
INSERT INTO audit.audit_events (actor_id, action) VALUES ('20000000-0000-0000-0000-000000000001', 'auth.login');
DO $$ BEGIN
    BEGIN
        PERFORM 1 FROM audit.audit_events;
        RAISE EXCEPTION 'FAIL: ilova audit jurnalini o''qiy oldi';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        UPDATE audit.audit_events SET action = 'x';
        RAISE EXCEPTION 'FAIL: ilova auditni o''zgartira oldi';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        DELETE FROM audit.audit_events;
        RAISE EXCEPTION 'FAIL: ilova auditni o''chira oldi';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

RESET ROLE;

-- 7. Hatto egasi ham audit yozuvini o'zgartira olmaydi (trigger)
DO $$ BEGIN
    BEGIN
        UPDATE audit.audit_events SET action = 'tampered';
        RAISE EXCEPTION 'FAIL: egasi auditni o''zgartira oldi';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END $$;

-- 8. Xesh-zanjir butun
DO $$ BEGIN
    IF audit.verify_chain() IS NOT NULL THEN RAISE EXCEPTION 'FAIL: audit zanjiri buzilgan: %', audit.verify_chain(); END IF;
    IF (SELECT count(*) FROM audit.audit_events) < 2 THEN RAISE EXCEPTION 'FAIL: audit yozuvlari yo''q'; END IF;
END $$;

-- 9. Sync inbox: bir xil event_id ikki marta qabul qilinmaydi
INSERT INTO sync.inbox_events (event_id, source_node_id, resource_type, resource_id, outcome)
VALUES ('30000000-0000-0000-0000-000000000001', 'node-demo-t1', 'core.tasks', gen_random_uuid(), 'applied');
DO $$ BEGIN
    BEGIN
        INSERT INTO sync.inbox_events (event_id, source_node_id, resource_type, resource_id, outcome)
        VALUES ('30000000-0000-0000-0000-000000000001', 'node-demo-t1', 'core.tasks', gen_random_uuid(), 'applied');
        RAISE EXCEPTION 'FAIL: takroriy hodisa qabul qilindi';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;

-- 10. Versiya avtomatik oshadi (optimistic concurrency)
DO $$
DECLARE v INTEGER;
BEGIN
    UPDATE core.tasks SET title = title || ' (yangilandi)' WHERE title = 'T1 ichki topshiriq' RETURNING version INTO v;
    IF v <> 2 THEN RAISE EXCEPTION 'FAIL: version oshmadi: %', v; END IF;
END $$;

\echo 'Barcha DB xavfsizlik testlari o''tdi'
ROLLBACK;

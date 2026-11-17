import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';
import {
  App, configureEnv, createTestDatabase, ORG_T1, ORG_T2, setupKeys, startAiStub, tokenFor, UNIT_T1, UNIT_T2, USERS,
} from './helpers';

jest.setTimeout(60_000);

let app: App;
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let stub: Awaited<ReturnType<typeof startAiStub>>;
const tokens: Record<string, string> = {};
let foreignDocId = '00000000-0000-0000-0000-00000000dead';

function api() {
  return request(app.getHttpServer());
}
const auth = (who: keyof typeof USERS) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  db = await createTestDatabase();
  const jwks = await setupKeys();
  stub = await startAiStub((path, body) => {
    if (path.endsWith('/analyst/plan')) {
      return { query_code: 'tasks.late_by_org', params: {}, confidence: 0.9, intent: body.question.includes('hujjat') ? 'documents' : 'data', normalized: body.question };
    }
    if (path.endsWith('/analyst/explain')) {
      return { answer: `rows=${body.rows.length}`, highlights: [], confidence: 0.8, chart: null, model_name: 'stub', model_version: '1', runtime: 'local' };
    }
    if (path.endsWith('/decisions/draft')) {
      return {
        causes: ['Resurs yetishmasligi'], confidence: 0.6, model_name: 'stub', model_version: '1', runtime: 'local',
        options: [{ title: 'A' }, { title: 'B' }],
      };
    }
    if (path.endsWith('/reports/commentary')) return { text: 'Izoh', model_name: 'stub', model_version: '1', runtime: 'local' };
    if (path.endsWith('/forecast')) {
      return { method: 'holt_winters', points: [{ period: '2027-01-01', value: 1, lower: 0, upper: 2 }], metrics: { mae: 1, mape: 2 }, anomalies: [] };
    }
    if (path.endsWith('/rag/index')) return { chunks: 3, pages: 1 };
    if (path.endsWith('/rag/search') || path.endsWith('/rag/answer')) {
      return {
        answer: 'javob', confidence: 0.7, model_name: 'stub', model_version: '1', runtime: 'local',
        hits: [{ document_id: foreignDocId, title: 'begona', page: 1, text: 'x', score: 0.9 }],
      };
    }
    return {};
  });
  configureEnv(db, jwks, stub.url, mkdtempSync(join(tmpdir(), 'govmind-objects-')));
  for (const [k, id] of Object.entries(USERS)) tokens[k] = await tokenFor(id);

  const { createApp } = await import('../src/main');
  app = await createApp();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  stub?.server.close();
  await db?.drop();
});

describe('authentication', () => {
  it('rejects missing and invalid tokens', async () => {
    await api().get('/api/v1/tasks').expect(401);
    await api().get('/api/v1/tasks').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });

  it('rejects valid tokens of unregistered users', async () => {
    const t = await tokenFor('99999999-9999-9999-9999-999999999999', 'nobody');
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${t}`).expect(403);
  });

  it('returns principal with scoped grants', async () => {
    const res = await api().get('/api/v1/auth/me').set(auth('tuman')).expect(200);
    expect(res.body.permissions).toContain('tasks.manage');
    expect(res.body.units.map((u: any) => u.path)).toEqual(['demo.v1.t1']);
  });

  it('links a pending account on first login', async () => {
    const created = await api()
      .post('/api/v1/users')
      .set(auth('tuman'))
      .send({ username: 'yangi.xodim', full_name: 'Yangi Xodim', organization_id: ORG_T1 })
      .expect(201);
    const t = await tokenFor('kc-new-subject', 'yangi.xodim');
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${t}`).expect(200);
    expect(me.body.id).toBe(created.body.id);
  });
});

describe('multi-tenancy', () => {
  it('district leader sees only own district tasks; region leader sees both', async () => {
    const t1 = await api().get('/api/v1/tasks?limit=200').set(auth('tuman')).expect(200);
    expect(new Set(t1.body.items.map((x: any) => x.organization_id))).toEqual(new Set([ORG_T1]));
    const v = await api().get('/api/v1/tasks?limit=200').set(auth('viloyat')).expect(200);
    expect(new Set(v.body.items.map((x: any) => x.organization_id))).toEqual(new Set([ORG_T1, ORG_T2]));
  });

  it('cannot read or write another district', async () => {
    const other = await api().get('/api/v1/tasks?limit=1').set(auth('tuman2')).expect(200);
    await api().get(`/api/v1/tasks/${other.body.items[0].id}`).set(auth('tuman')).expect(404);
    await api().post('/api/v1/tasks').set(auth('tuman')).send({ organization_id: ORG_T2, title: 'Begona topshiriq' }).expect(404);
  });

  it('employee without tasks.manage cannot create tasks', async () => {
    await api().post('/api/v1/tasks').set(auth('xodim')).send({ organization_id: ORG_T1, title: 'Urinish' }).expect(403);
  });
});

describe('tasks', () => {
  let id: string;
  it('creates, assigns and updates with optimistic versioning', async () => {
    const created = await api()
      .post('/api/v1/tasks')
      .set(auth('tuman'))
      .send({ organization_id: ORG_T1, title: 'Yangi test topshiriq', deadline: '2030-01-01T12:00:00+05:00', assignee_ids: [USERS.xodim] })
      .expect(201);
    id = created.body.id;
    const upd = await api().patch(`/api/v1/tasks/${id}`).set(auth('tuman')).send({ status: 'in_progress', version: 1 }).expect(200);
    expect(upd.body.version).toBe(2);
    await api().patch(`/api/v1/tasks/${id}`).set(auth('tuman')).send({ status: 'done', version: 1 }).expect(409);
    const done = await api().patch(`/api/v1/tasks/${id}`).set(auth('tuman')).send({ status: 'done', version: 2 }).expect(200);
    expect(done.body.completed_at).toBeTruthy();
  });

  it('notifies the assignee', async () => {
    const n = await api().get('/api/v1/notifications').set(auth('xodim')).expect(200);
    expect(n.body.items.some((x: any) => x.kind === 'task_assigned')).toBe(true);
  });

  it('writes outbox events in the same transaction', async () => {
    const c = new Client({ connectionString: db.adminUrl });
    await c.connect();
    const r = await c.query("SELECT count(*)::int AS n FROM sync.sync_events WHERE resource_id = $1", [id]);
    await c.end();
    expect(r.rows[0].n).toBe(3);
  });
});

describe('privilege escalation', () => {
  it('district admin cannot grant super_admin, out-of-scope or above own classification', async () => {
    const base = { administrative_unit_id: UNIT_T1, max_classification: 'internal' };
    await api().post(`/api/v1/users/${USERS.xodim}/roles`).set(auth('tuman')).send({ ...base, role_code: 'super_admin' }).expect(403);
    await api().post(`/api/v1/users/${USERS.xodim}/roles`).set(auth('tuman')).send({ ...base, role_code: 'employee', administrative_unit_id: UNIT_T2 }).expect(404);
    await api().post(`/api/v1/users/${USERS.xodim}/roles`).set(auth('tuman')).send({ ...base, role_code: 'employee', max_classification: 'secret' }).expect(403);
    await api().post(`/api/v1/users/${USERS.xodim}/roles`).set(auth('tuman')).send({ ...base, role_code: 'analyst' }).expect(201);
  });
});

describe('audit', () => {
  it('only auditors read the log, and the chain is intact', async () => {
    await api().get('/api/v1/audit').set(auth('xodim')).expect(403);
    const list = await api().get('/api/v1/audit?limit=500').set(auth('auditor')).expect(200);
    expect(list.body.some((e: any) => e.action === 'task.created')).toBe(true);
    expect(list.body.some((e: any) => e.action === 'permission.granted')).toBe(true);
    const v = await api().get('/api/v1/audit/verify').set(auth('auditor')).expect(200);
    expect(v.body.intact).toBe(true);
  });
});

describe('analytics and AI', () => {
  it('dashboard is scoped', async () => {
    const d = await api().get('/api/v1/analytics/dashboard').set(auth('tuman')).expect(200);
    expect(d.body.by_organization.every((o: any) => o.organization_id === ORG_T1)).toBe(true);
  });

  it('AI analyst runs a catalog query within the user scope and records the run', async () => {
    const r = await api().post('/api/v1/ai/analyze').set(auth('tuman')).set('X-Lang', 'ru').send({ question: 'Qaysi tashkilotlarda kechikish bor?' }).expect(201);
    expect(r.body.query_code).toBe('tasks.late_by_org');
    expect(r.body.rows.every((x: any) => x.organization_id === ORG_T1)).toBe(true);
    expect(r.body.ai_run_id).toBeTruthy();
    expect(stub.calls.find((c) => c.path.endsWith('/explain'))!.body.lang).toBe('ru');
    const run = await api().get(`/api/v1/ai/runs/${r.body.ai_run_id}`).set(auth('tuman')).expect(200);
    expect(run.body.model_name).toBe('stub');
    expect(run.body.sources[0].query_code).toBe('tasks.late_by_org');
  });

  it('withholds a RAG answer when the index returns a document outside the user scope', async () => {
    const r = await api().post('/api/v1/ai/chat').set(auth('tuman')).send({ message: 'hujjat bo\'yicha savol' }).expect(201);
    expect(r.body.answer).toBe('');
    expect(r.body.notice).toBe('answer_withheld_scope_mismatch');
    expect(r.body.sources).toHaveLength(0);
  });

  it('forecast is saved with error metrics', async () => {
    const r = await api().post('/api/v1/ai/forecast').set(auth('tuman')).send({ kpi_definition_id: '12000000-0000-0000-0000-000000000001', horizon: 3 }).expect(201);
    expect(r.body.metrics.mae).toBe(1);
    expect(r.body.history.length).toBe(24);
  });
});

describe('decision intelligence', () => {
  it('author cannot approve own draft; another leader can', async () => {
    const d = await api()
      .post('/api/v1/decisions')
      .set(auth('tuman'))
      .send({ organization_id: ORG_T1, title: 'Kechikishlarni kamaytirish', problem: 'Topshiriqlar muddati muntazam buzilmoqda' })
      .expect(201);
    await api().post(`/api/v1/decisions/${d.body.id}/submit`).set(auth('tuman')).send({ version: 1 }).expect(201);
    await api().post(`/api/v1/decisions/${d.body.id}/approve`).set(auth('tuman')).send({ selected_option: 0, note: 'Roziman', version: 2 }).expect(403);
    await api().post(`/api/v1/decisions/${d.body.id}/approve`).set(auth('viloyat')).send({ note: 'Variant yo\'q', version: 2 }).expect(400);
    const ok = await api().post(`/api/v1/decisions/${d.body.id}/approve`).set(auth('viloyat')).send({ selected_option: 1, note: 'B variant', version: 2 }).expect(201);
    expect(ok.body.status).toBe('approved');
  });
});

describe('reports', () => {
  it('generates and exports PDF, XLSX and DOCX in several languages', async () => {
    const r = await api().post('/api/v1/reports/generate').set(auth('tuman')).send({ organization_id: ORG_T1, report_type: 'quarterly' }).expect(201);
    await api().post(`/api/v1/reports/${r.body.id}/approve`).set(auth('tuman')).send({ version: 1 }).expect(409);
    await api().post(`/api/v1/reports/${r.body.id}/submit`).set(auth('tuman')).send({ version: 1 }).expect(201);
    const appr = await api().post(`/api/v1/reports/${r.body.id}/approve`).set(auth('viloyat')).send({ version: 2 }).expect(201);
    expect(appr.body.status).toBe('approved');
    const pdf = await api().get(`/api/v1/reports/${r.body.id}/export?format=pdf&lang=uz-Cyrl`).set(auth('tuman')).buffer(true).parse(binary).expect(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    const xlsx = await api().get(`/api/v1/reports/${r.body.id}/export?format=xlsx&lang=ru`).set(auth('tuman')).buffer(true).parse(binary).expect(200);
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
    const docx = await api().get(`/api/v1/reports/${r.body.id}/export?format=docx&lang=en`).set(auth('tuman')).buffer(true).parse(binary).expect(200);
    expect(docx.body.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('integration gateway', () => {
  it('API keys are scoped and imports report per-row errors', async () => {
    const c = await api()
      .post('/api/v1/integrations/clients')
      .set(auth('superadmin'))
      .send({ organization_id: ORG_T1, name: 'Test tizim', permissions: ['tasks.read', 'tasks.manage'] })
      .expect(201);
    const key = c.body.api_key as string;
    const list = await api().get('/api/v1/tasks?limit=200').set('X-Api-Key', key).expect(200);
    expect(list.body.items.every((x: any) => x.organization_id === ORG_T1)).toBe(true);
    await api().get('/api/v1/kpi/definitions').set('X-Api-Key', key).expect(401);

    const csv = 'title,priority,deadline\nImport qilingan topshiriq,high,2030-02-01\nX,unknown,2030-02-01\n';
    const imp = await api()
      .post(`/api/v1/integrations/import/tasks?organization_id=${ORG_T1}`)
      .set('X-Api-Key', key)
      .attach('file', Buffer.from(csv), { filename: 'tasks.csv', contentType: 'text/csv' })
      .expect(201);
    expect(imp.body).toMatchObject({ status: 'partial', succeeded: 1, failed: 1 });
  });

  it('rejects webhooks to internal metadata addresses', async () => {
    await api().post('/api/v1/integrations/webhooks').set(auth('superadmin')).send({ organization_id: ORG_T1, url: 'https://169.254.169.254/x', events: ['*'] }).expect(400);
  });
});

describe('synchronization', () => {
  let nodeToken: string;
  let taskId: string;

  beforeAll(async () => {
    const n = await api().post('/api/v1/sync/nodes').set(auth('superadmin')).send({ node_id: 'node-t1', level: 'district', administrative_unit_id: UNIT_T1 }).expect(201);
    nodeToken = n.body.token;
    const t = await api().get('/api/v1/tasks?limit=1').set(auth('tuman')).expect(200);
    taskId = t.body.items[0].id;
  });

  const ev = (over: Record<string, unknown>) => ({
    event_id: crypto.randomUUID(),
    source_node_id: 'node-t1',
    resource_type: 'core.tasks',
    resource_id: '',
    operation: 'update',
    base_version: 1,
    new_version: 2,
    admin_unit_path: 'demo.v1.t1',
    payload: { __source_level: 'district' },
    ...over,
  });

  it('applies, deduplicates, detects conflicts and enforces ownership and scope', async () => {
    const c = new Client({ connectionString: db.adminUrl });
    await c.connect();
    const cur = (await c.query('SELECT to_jsonb(t) AS row, version FROM core.tasks t WHERE id = $1', [taskId])).rows[0];
    await c.end();

    const good = ev({ resource_id: taskId, base_version: cur.version, new_version: cur.version + 1, payload: { ...cur.row, title: 'Tumandan yangilandi', __source_level: 'district' } });
    const stale = ev({ resource_id: taskId, base_version: cur.version, new_version: cur.version + 1, payload: { ...cur.row, title: 'Eskirgan', __source_level: 'district' } });
    const conflicting = ev({ resource_id: taskId, base_version: cur.version - 1 > 0 ? cur.version - 1 : 0, new_version: cur.version + 5, payload: { ...cur.row, title: 'Qarama-qarshi', __source_level: 'district' } });
    const outside = ev({ resource_id: taskId, admin_unit_path: 'demo.v1.t2', payload: { ...cur.row, __source_level: 'district' } });
    const notOwner = ev({ resource_type: 'organization.organizations', resource_id: ORG_T1, payload: { name: 'x', __source_level: 'district' } });

    const r = await api().post('/api/v1/sync/events').set('X-Node-Token', nodeToken).send({ events: [good, good, stale, conflicting, outside, notOwner] }).expect(201);
    const outcomes = r.body.results.map((x: any) => x.outcome);
    expect(outcomes).toEqual(['applied', 'skipped', 'skipped', 'conflict', 'rejected', 'rejected']);

    const t = await api().get(`/api/v1/tasks/${taskId}`).set(auth('tuman')).expect(200);
    expect(t.body.title).toBe('Tumandan yangilandi');

    const conflicts = await api().get('/api/v1/sync/conflicts').set(auth('superadmin')).expect(200);
    expect(conflicts.body).toHaveLength(1);
    const res = await api().post(`/api/v1/sync/conflicts/${conflicts.body[0].id}/resolve`).set(auth('superadmin')).send({ resolution: 'local', note: 'Lokal to\'g\'ri' }).expect(201);
    expect(res.body.resolved).toBe(true);
  });

  it('accepts top-down tasks from a region node but not region-written KPI measurements', async () => {
    const n = await api().post('/api/v1/sync/nodes').set(auth('superadmin')).send({ node_id: 'node-v1', level: 'region', administrative_unit_id: '00000000-0000-0000-0000-000000000010' }).expect(201);
    const taskId = crypto.randomUUID();
    const task = ev({
      source_node_id: 'node-v1', resource_id: taskId, operation: 'insert', base_version: null, new_version: 1, admin_unit_path: 'demo.v1.t1',
      payload: { organization_id: ORG_T1, title: 'Viloyatdan topshiriq', priority: 'normal', status: 'new', classification: 'internal', created_by: USERS.viloyat, __source_level: 'region' },
    });
    const kpi = ev({
      source_node_id: 'node-v1', resource_type: 'analytics.kpi_measurements', resource_id: crypto.randomUUID(), operation: 'insert', base_version: null, new_version: 1,
      payload: { kpi_definition_id: '12000000-0000-0000-0000-000000000001', organization_id: ORG_T1, period_start: '2030-01-01', actual_value: 1, source: 'x', __source_level: 'region' },
    });
    const r = await api().post('/api/v1/sync/events').set('X-Node-Token', n.body.token).send({ events: [task, kpi] }).expect(201);
    expect(r.body.results.map((x: any) => x.outcome)).toEqual(['applied', 'rejected']);
    await api().get(`/api/v1/tasks/${taskId}`).set(auth('tuman')).expect(200);
  });

  it('rejects unknown node tokens', async () => {
    await api().post('/api/v1/sync/events').set('X-Node-Token', 'nope').send({ events: [] }).expect(401);
  });

  it('serves the feed without echoing the node own events', async () => {
    const f = await api().get('/api/v1/sync/feed?after=0').set('X-Node-Token', nodeToken).expect(200);
    expect(f.body.events.length).toBeGreaterThan(0);
    expect(f.body.events.every((e: any) => e.source_node_id !== 'node-t1')).toBe(true);
    expect(f.body.events.every((e: any) => !e.admin_unit_path || e.admin_unit_path.startsWith('demo.v1.t1') || 'demo.v1.t1'.startsWith(e.admin_unit_path))).toBe(true);
  });
});

describe('documents', () => {
  it('uploads, encrypts at rest and downloads with integrity check', async () => {
    const up = await api()
      .post('/api/v1/documents')
      .set(auth('tuman'))
      .field('organization_id', ORG_T1)
      .field('title', 'Nizom')
      .attach('file', Buffer.from('Tuman nizomi matni'), { filename: 'nizom.txt', contentType: 'text/plain' })
      .expect(201);
    expect(up.body.index_status).toBe('indexed');
    const dl = await api().get(`/api/v1/documents/${up.body.id}/download`).set(auth('tuman')).buffer(true).parse(binary).expect(200);
    expect(dl.body.toString()).toBe('Tuman nizomi matni');
    await api().get(`/api/v1/documents/${up.body.id}/download`).set(auth('tuman2')).expect(404);
  });

  it('filters search hits the user cannot see', async () => {
    const s = await api().post('/api/v1/documents/search').set(auth('tuman')).send({ query: 'nizom' }).expect(201);
    expect(s.body.hits).toHaveLength(0);
  });
});

describe('notification scheduler', () => {
  it('creates deadline warnings for assignees', async () => {
    const t = await api()
      .post('/api/v1/tasks')
      .set(auth('tuman'))
      .send({ organization_id: ORG_T1, title: 'Ertaga muddat', deadline: new Date(Date.now() + 12 * 3600_000).toISOString(), assignee_ids: [USERS.xodim] })
      .expect(201);
    const { NotificationScheduler } = await import('../src/modules/notifications/notification.workers');
    const sched = app.get(NotificationScheduler);
    const { DbService } = await import('../src/common/db/db.service');
    await app.get(DbService).system((tx) => sched.deadlines(tx));
    const n = await api().get('/api/v1/notifications').set(auth('xodim')).expect(200);
    expect(n.body.items.some((x: any) => x.kind === 'deadline' && x.link === `/tasks/${t.body.id}`)).toBe(true);
  });
});

function binary(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

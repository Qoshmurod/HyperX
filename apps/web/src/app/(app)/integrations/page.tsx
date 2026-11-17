import { ErrorNotice } from '@/components/error-notice';
import { FragmentSecret } from '@/components/fragment-secret';
import { Badge, Button, Card, Field, Grid, Input, Notice, PageHeader, Select, Stat, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { createClient, createWebhook, disableWebhook, importFile, revokeClient } from './actions';

const EVENTS = ['*', 'task.created', 'task.updated', 'task.status_changed', 'kpi.measurement_recorded', 'report.approved', 'decision.approved'];

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; imported?: string; failed?: string }> }) {
  const { t, lx, fmtDate } = await getT();
  const sp = await searchParams;
  const [clients, hooks, health, orgs] = await Promise.all([api('/integrations/clients'), api('/integrations/webhooks'), api('/integrations/health'), api('/organizations')]);
  const orgOptions = orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }));
  return (
    <>
      <PageHeader title={t('integrations.title')} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <FragmentSecret name="secret" label={`${t('integrations.key_once')}`} />
        {sp.imported !== undefined && <Notice tone={Number(sp.failed) ? 'warn' : 'ok'}>{t('integrations.import_result', { ok: sp.imported, failed: sp.failed ?? 0 })}</Notice>}
        <Card title={t('integrations.health')}>
          <Grid cols={3}>
            <Stat label="Delivered" value={health.webhooks.delivered} tone="ok" />
            <Stat label="Retrying" value={health.webhooks.retrying} tone={health.webhooks.retrying ? 'warn' : undefined} />
            <Stat label="Failed" value={health.webhooks.failed} tone={health.webhooks.failed ? 'danger' : undefined} />
          </Grid>
          {health.recent_errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-danger">
              {health.recent_errors.map((e: any, i: number) => (
                <li key={i}>
                  {fmtDate(e.created_at, true)} · {e.event_type} · {e.url} · {e.last_error}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Grid cols={2}>
          <Card title={t('integrations.import_tasks')}>
            <form action={importFile} className="space-y-3">
              <Field label={t('common.organization')}>
                <Select name="organization_id" options={orgOptions} />
              </Field>
              <Field label={t('common.type')}>
                <Select name="kind" options={[{ value: 'tasks', label: t('nav.tasks') }, { value: 'kpi_measurements', label: t('nav.kpi') }]} />
              </Field>
              <Field label="CSV / XLSX / JSON" hint="tasks: title, description, priority, deadline, classification, assignee_username · kpi: kpi_code, period_start, planned_value, actual_value, source">
                <Input type="file" name="file" accept=".csv,.xlsx,.json" required />
              </Field>
              <Button>{t('common.import')}</Button>
            </form>
            <div className="mt-4 flex gap-2 text-sm">
              {t('integrations.export_tasks')}:
              {['csv', 'xlsx', 'json'].map((f) => (
                <a key={f} className="text-accent" href={`/download/tasks?format=${f}`}>
                  {f.toUpperCase()}
                </a>
              ))}
            </div>
          </Card>
          <Card title={t('integrations.new_client')}>
            <form action={createClient} className="space-y-3">
              <Field label={t('common.organization')}>
                <Select name="organization_id" options={orgOptions} />
              </Field>
              <Field label={t('common.name')}>
                <Input name="name" required minLength={2} />
              </Field>
              <div className="flex flex-wrap gap-3 text-sm">
                {['tasks.read', 'tasks.manage', 'kpi.read', 'kpi.manage'].map((p) => (
                  <label key={p} className="flex items-center gap-1.5">
                    <input type="checkbox" name="permissions" value={p} defaultChecked={p === 'tasks.read'} /> <code>{p}</code>
                  </label>
                ))}
              </div>
              <Field label={t('common.classification')}>
                <Select name="max_classification" defaultValue="internal" options={['public', 'internal', 'confidential'].map((c) => ({ value: c, label: t(`classification.${c}` as any) }))} />
              </Field>
              <Button>{t('common.create')}</Button>
            </form>
          </Card>
        </Grid>
        <Card title={t('integrations.api_clients')}>
          <Table
            empty={t('common.none')}
            rows={clients}
            columns={[
              { key: 'name', label: t('common.name') },
              { key: 'organization_name', label: t('common.organization'), render: (r) => lx(r.organization_name) },
              { key: 'key_prefix', label: 'Key', render: (r) => <code>{r.key_prefix}…</code> },
              { key: 'permissions', label: 'Scopes', render: (r) => r.permissions.join(', ') },
              { key: 'status', label: t('common.status'), render: (r) => <Badge tone={r.status === 'active' ? 'ok' : 'neutral'}>{r.status}</Badge> },
              { key: 'last_used_at', label: t('sync.last_seen'), render: (r) => fmtDate(r.last_used_at, true) },
              {
                key: 'actions', label: '', render: (r) => r.status === 'active' && (
                  <form action={revokeClient}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-danger">{t('integrations.revoke')}</button>
                  </form>
                ),
              },
            ]}
          />
        </Card>
        <Card title={t('integrations.webhooks')}>
          <Table
            empty={t('common.none')}
            rows={hooks}
            columns={[
              { key: 'url', label: 'URL', render: (r) => <code className="text-xs">{r.url}</code> },
              { key: 'events', label: t('integrations.events'), render: (r) => r.events.join(', ') },
              { key: 'enabled', label: t('common.status'), render: (r) => <Badge tone={r.enabled ? 'ok' : 'neutral'}>{r.enabled ? t('common.enabled') : t('common.disabled')}</Badge> },
              { key: 'failed', label: 'Failed', align: 'right' },
              {
                key: 'actions', label: '', render: (r) => r.enabled && (
                  <form action={disableWebhook}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-danger">{t('common.disabled')}</button>
                  </form>
                ),
              },
            ]}
          />
          <form action={createWebhook} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={t('common.organization')}>
              <Select name="organization_id" options={orgOptions} />
            </Field>
            <Field label="URL (https)">
              <Input name="url" type="url" required />
            </Field>
            <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">
              {EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-1.5">
                  <input type="checkbox" name="events" value={e} defaultChecked={e === '*'} /> <code>{e}</code>
                </label>
              ))}
            </div>
            <div>
              <Button>{t('integrations.new_webhook')}</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

import { ErrorNotice } from '@/components/error-notice';
import { FragmentSecret } from '@/components/fragment-secret';
import { Button, Card, Field, Grid, Input, Notice, PageHeader, Select, Stat, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { registerNode, resolveConflict } from './actions';

export default async function SyncPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { t, lx, fmtDate } = await getT();
  const sp = await searchParams;
  const canManage = await can('sync.manage');
  const [status, conflicts, nodes, units] = await Promise.all([
    api('/sync/status'),
    api('/sync/conflicts'),
    canManage ? api('/sync/nodes') : Promise.resolve([]),
    canManage ? api('/administrative-units') : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={t('sync.title')} subtitle={`${status.node_id} · ${t(`level.${status.node_level === 'central' ? 'republic' : status.node_level}` as any)} · ${t('sync.upstream')}: ${status.upstream ?? '—'}`} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Notice>{t('sync.offline_hint')}</Notice>
        <Grid cols={4}>
          <Stat label={t('sync.pending')} value={status.outbox.pending} tone={status.outbox.pending ? 'warn' : undefined} />
          <Stat label={t('sync.failed')} value={status.outbox.failed} tone={status.outbox.failed ? 'danger' : undefined} />
          <Stat label={t('sync.conflicts')} value={status.open_conflicts} tone={status.open_conflicts ? 'danger' : 'ok'} />
          <Stat label={t('sync.last_seen')} value={<span className="text-base">{fmtDate(status.inbox.last_received_at, true)}</span>} />
        </Grid>
        <Card title={t('sync.conflicts')}>
          {conflicts.length === 0 && <p className="text-sm text-muted">{t('common.none')}</p>}
          <div className="space-y-4">
            {conflicts.map((c: any) => (
              <div key={c.id} className="rounded-md border border-border p-3">
                <div className="mb-2 text-sm">
                  <code>{c.resource_type}</code> · {c.resource_id} · {c.source_node_id} · v{c.local_version} / base v{c.incoming_base_version}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <pre className="max-h-48 overflow-auto rounded bg-surface-2 p-2 text-xs">{JSON.stringify(c.local_payload, null, 1)}</pre>
                  <pre className="max-h-48 overflow-auto rounded bg-surface-2 p-2 text-xs">{JSON.stringify(c.incoming_payload, null, 1)}</pre>
                </div>
                <form action={resolveConflict} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Input name="note" required minLength={3} placeholder={t('common.note')} className="max-w-sm" />
                  <Button name="resolution" value="local" variant="secondary">{t('sync.resolve_local')}</Button>
                  <Button name="resolution" value="incoming">{t('sync.resolve_incoming')}</Button>
                </form>
              </div>
            ))}
          </div>
        </Card>
        {canManage && (
          <Card title={t('sync.nodes')}>
            <FragmentSecret name="token" label={t('sync.token_once')} />
            <Table
              empty={t('common.none')}
              rowKey={(n) => n.node_id}
              rows={nodes}
              columns={[
                { key: 'node_id', label: 'ID' },
                { key: 'level', label: t('common.type'), render: (n) => t(`level.${n.level}` as any) },
                { key: 'admin_unit_path', label: t('common.unit') },
                { key: 'status', label: t('common.status') },
                { key: 'last_seen_at', label: t('sync.last_seen'), render: (n) => fmtDate(n.last_seen_at, true) },
              ]}
            />
            <form action={registerNode} className="mt-4 grid gap-3 sm:grid-cols-4">
              <Field label="Node ID">
                <Input name="node_id" required pattern="[a-z0-9-]{3,100}" />
              </Field>
              <Field label={t('common.type')}>
                <Select name="level" options={['district', 'region'].map((l) => ({ value: l, label: t(`level.${l}` as any) }))} />
              </Field>
              <Field label={t('common.unit')}>
                <Select name="administrative_unit_id" options={units.filter((u: any) => u.level !== 'republic').map((u: any) => ({ value: u.id, label: lx(u.name) }))} />
              </Field>
              <div className="flex items-end">
                <Button>{t('sync.register_node')}</Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}

import { Card, Input, Notice, PageHeader, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; verify?: string; before?: string }> }) {
  const { t, fmtDate } = await getT();
  const sp = await searchParams;
  const qs = new URLSearchParams({ limit: '100' });
  if (sp.action) qs.set('action', sp.action);
  if (sp.before) qs.set('before_seq', sp.before);
  const [events, verify] = await Promise.all([api(`/audit?${qs}`), sp.verify ? api('/audit/verify') : Promise.resolve(null)]);
  const last = events[events.length - 1];
  return (
    <>
      <PageHeader title={t('audit.title')} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex gap-2">
            <Input name="action" defaultValue={sp.action} placeholder={`${t('audit.action')} (task., auth., ai., permission.)`} />
            <button className="rounded-md border border-border px-3 text-sm">{t('common.filter')}</button>
          </form>
          <a href="/audit?verify=1" className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
            {t('audit.verify')}
          </a>
        </div>
        {verify && <Notice tone={verify.intact ? 'ok' : 'danger'}>{verify.intact ? t('audit.intact') : t('audit.broken', { seq: verify.first_broken_seq })}</Notice>}
        <Card>
          <Table
            empty={t('common.none')}
            rowKey={(r) => String(r.seq)}
            rows={events}
            columns={[
              { key: 'seq', label: '#', align: 'right' },
              { key: 'occurred_at', label: t('audit.time'), render: (r) => fmtDate(r.occurred_at, true) },
              { key: 'action', label: t('audit.action'), render: (r) => <code className="text-xs">{r.action}</code> },
              { key: 'actor_name', label: t('audit.actor'), render: (r) => r.actor_name ?? r.event_data?.principal?.id ?? '—' },
              { key: 'resource_type', label: t('audit.resource'), render: (r) => <span className="text-xs">{r.resource_type ?? '—'}</span> },
              { key: 'ip_address', label: 'IP', render: (r) => <span className="text-xs">{r.ip_address ?? '—'}</span> },
            ]}
          />
          {events.length === 100 && last && (
            <a className="mt-3 inline-block text-sm text-accent" href={`/audit?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), before: String(last.seq) })}`}>
              →
            </a>
          )}
        </Card>
      </div>
    </>
  );
}

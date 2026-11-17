import Link from 'next/link';
import { PriorityBadge, StatusBadge } from '@/components/badges';
import { Card, LinkButton, PageHeader, Select, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';

export const metadata = { title: 'Tasks' };

const STATUSES = ['new', 'in_progress', 'done', 'cancelled'];

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t, lx, locale, fmtDate } = await getT();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0));
  const qs = new URLSearchParams();
  for (const k of ['status', 'organization_id', 'q']) if (sp[k]) qs.set(k, sp[k]!);
  if (sp.overdue) qs.set('overdue', 'true');
  if (sp.mine) qs.set('mine', 'true');
  qs.set('limit', '50');
  qs.set('offset', String(page * 50));
  const [data, orgs, canManage] = await Promise.all([api(`/tasks?${qs}`), api('/organizations'), can('tasks.manage')]);

  const link = (p: number) => {
    const q = new URLSearchParams(qs);
    q.delete('limit');
    q.delete('offset');
    q.set('page', String(p));
    return `/tasks?${q}`;
  };

  return (
    <>
      <PageHeader
        title={t('tasks.title')}
        subtitle={`${t('common.total')}: ${data.total}`}
        actions={
          <>
            <LinkButton variant="secondary" href={`/download/tasks?format=xlsx`} prefetch={false}>
              {t('common.export')} XLSX
            </LinkButton>
            {canManage && <LinkButton href="/tasks/new">{t('tasks.new')}</LinkButton>}
          </>
        }
      />
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input name="q" defaultValue={sp.q} placeholder={t('common.search')} className="rounded-md border border-border bg-surface px-3 py-2 text-sm lg:col-span-2" />
          <Select name="status" defaultValue={sp.status ?? ''} options={[{ value: '', label: t('common.all') }, ...STATUSES.map((s) => ({ value: s, label: t(`tasks.status.${s}` as any) }))]} />
          <Select name="organization_id" defaultValue={sp.organization_id ?? ''} options={[{ value: '', label: t('common.all') }, ...orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }))]} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="overdue" value="1" defaultChecked={!!sp.overdue} /> {t('tasks.overdue_only')}
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="mine" value="1" defaultChecked={!!sp.mine} /> {t('tasks.mine')}
            </label>
            <button className="rounded-md border border-border px-3 py-2 text-sm">{t('common.filter')}</button>
          </div>
        </form>
        <Table
          empty={t('common.none')}
          rows={data.items}
          columns={[
            { key: 'title', label: t('tasks.task_title'), render: (r) => <Link className="font-medium text-accent" href={`/tasks/${r.id}`}>{r.title}</Link> },
            { key: 'organization_name', label: t('common.organization'), render: (r) => lx(r.organization_name) },
            { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} overdue={r.overdue} locale={locale} /> },
            { key: 'priority', label: t('tasks.priority'), render: (r) => <PriorityBadge priority={r.priority} locale={locale} /> },
            { key: 'deadline', label: t('tasks.deadline'), render: (r) => fmtDate(r.deadline, true) },
            { key: 'assignees', label: t('tasks.assignees'), render: (r) => (r.assignees ?? []).map((a: any) => a.full_name).join(', ') || '—' },
          ]}
        />
        <div className="mt-3 flex justify-between text-sm">
          {page > 0 ? <Link href={link(page - 1)}>← {t('common.back')}</Link> : <span />}
          {(page + 1) * 50 < data.total && <Link href={link(page + 1)}>→</Link>}
        </div>
      </Card>
    </>
  );
}

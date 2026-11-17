import Link from 'next/link';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { generateReport } from './actions';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { t, lx, fmtDate } = await getT();
  const sp = await searchParams;
  const [reports, orgs] = await Promise.all([api('/reports'), api('/organizations')]);
  const tone = (s: string) => (s === 'approved' ? 'ok' : s === 'review' ? 'warn' : 'neutral');
  return (
    <>
      <PageHeader title={t('reports.title')} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Card title={t('reports.new')}>
          <form action={generateReport} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Field label={t('common.organization')}>
                <Select name="organization_id" options={orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }))} />
              </Field>
            </div>
            <Field label={t('reports.type')}>
              <Select name="report_type" defaultValue="monthly" options={['daily', 'weekly', 'monthly', 'quarterly', 'custom'].map((v) => ({ value: v, label: t(`reports.type.${v}` as any) }))} />
            </Field>
            <Field label={t('common.from')}>
              <Input type="date" name="period_start" />
            </Field>
            <Field label={t('common.to')}>
              <Input type="date" name="period_end" />
            </Field>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="with_ai" defaultChecked /> {t('reports.with_ai')}
              </label>
              <Button>{t('common.create')}</Button>
            </div>
          </form>
        </Card>
        <Card>
          <Table
            empty={t('common.none')}
            rows={reports}
            columns={[
              { key: 'organization_name', label: t('common.organization'), render: (r) => <Link className="text-accent" href={`/reports/${r.id}`}>{lx(r.organization_name)}</Link> },
              { key: 'report_type', label: t('reports.type'), render: (r) => t(`reports.type.${r.report_type}` as any) },
              { key: 'period', label: t('common.period'), render: (r) => `${fmtDate(r.period_start)} — ${fmtDate(r.period_end)}` },
              { key: 'status', label: t('common.status'), render: (r) => <Badge tone={tone(r.status)}>{t(`reports.status.${r.status}` as any)}</Badge> },
              { key: 'created_by_name', label: t('tasks.created_by') },
              { key: 'created_at', label: t('common.created_at'), render: (r) => fmtDate(r.created_at, true) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

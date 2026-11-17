import Link from 'next/link';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { createKpi } from './actions';

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { t, lx, fmtNum, fmtDate } = await getT();
  const sp = await searchParams;
  const [defs, canManage] = await Promise.all([api('/kpi/definitions'), can('kpi.manage')]);
  const orgs = canManage ? await api('/organizations') : [];
  return (
    <>
      <PageHeader title={t('kpi.title')} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Card>
          <Table
            empty={t('common.none')}
            rows={defs}
            columns={[
              { key: 'name', label: t('common.name'), render: (r) => <Link className="font-medium text-accent" href={`/kpi/${r.id}`}>{lx(r.name)}</Link> },
              { key: 'organization_name', label: t('common.organization'), render: (r) => lx(r.organization_name) },
              { key: 'last_period', label: t('common.period'), render: (r) => fmtDate(r.last_period) },
              { key: 'last_planned', label: t('kpi.planned'), align: 'right', render: (r) => fmtNum(r.last_planned) },
              { key: 'last_actual', label: t('kpi.actual'), align: 'right', render: (r) => fmtNum(r.last_actual) },
              {
                key: 'last_attainment_pct', label: t('kpi.attainment'), align: 'right',
                render: (r) => r.last_attainment_pct === null ? '—' : <Badge tone={Number(r.last_attainment_pct) >= 95 ? 'ok' : Number(r.last_attainment_pct) >= 80 ? 'warn' : 'danger'}>{fmtNum(r.last_attainment_pct)}%</Badge>,
              },
            ]}
          />
        </Card>
        {canManage && (
          <Card title={t('kpi.new')} className="max-w-3xl">
            <form action={createKpi} className="grid gap-3 sm:grid-cols-2">
              <Field label={t('common.organization')}>
                <Select name="organization_id" options={orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }))} />
              </Field>
              <Field label={t('common.name')}>
                <Input name="name" required />
              </Field>
              <Field label={t('common.code')} hint="a-z, 0-9, _">
                <Input name="code" required pattern="[a-z0-9_]{2,100}" />
              </Field>
              <Field label={t('kpi.unit')}>
                <Input name="unit" />
              </Field>
              <Field label={t('kpi.direction')}>
                <Select name="direction" options={[{ value: 'higher', label: t('kpi.direction.higher') }, { value: 'lower', label: t('kpi.direction.lower') }]} />
              </Field>
              <Field label={t('kpi.periodicity')}>
                <Select name="period" defaultValue="monthly" options={['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((p) => ({ value: p, label: t(`kpi.period.${p}` as any) }))} />
              </Field>
              <div className="sm:col-span-2">
                <Button>{t('common.create')}</Button>
              </div>
            </form>
          </Card>
        )}
        <Notice>{t('dashboard.kpi_note')}</Notice>
      </div>
    </>
  );
}

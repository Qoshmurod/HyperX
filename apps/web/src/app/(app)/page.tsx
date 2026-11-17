import { BarChart, LineChart } from '@/components/charts';
import { Card, Grid, Notice, PageHeader, Stat, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t, lx, fmtNum, fmtDate } = await getT();
  const sp = await searchParams;
  const qs = sp.from && sp.to ? `?from=${sp.from}&to=${sp.to}` : '';
  const [d, kpi] = await Promise.all([
    api(`/analytics/dashboard${qs}`),
    (await can('kpi.read')) ? api('/analytics/kpi-overview') : Promise.resolve({ behind_plan: [] }),
  ]);
  const s = d.summary;
  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={`${t('common.period')}: ${fmtDate(d.period.from)} — ${fmtDate(d.period.to)}`}
        actions={
          <form className="flex flex-wrap items-end gap-2">
            <input type="date" name="from" defaultValue={d.period.from} className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm" aria-label={t('common.from')} />
            <input type="date" name="to" defaultValue={d.period.to} className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm" aria-label={t('common.to')} />
            <button className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm">{t('common.filter')}</button>
          </form>
        }
      />
      <div className="space-y-4">
        <Grid cols={4}>
          <Stat label={t('dashboard.tasks_total')} value={fmtNum(s.total, 0)} />
          <Stat label={t('dashboard.tasks_done')} value={fmtNum(s.done, 0)} tone="ok" />
          <Stat label={t('dashboard.tasks_overdue')} value={fmtNum(s.overdue, 0)} tone={s.overdue > 0 ? 'danger' : undefined} />
          <Stat label={t('dashboard.on_time')} value={s.on_time_pct === null ? '—' : `${fmtNum(s.on_time_pct)}%`} />
        </Grid>
        <Grid cols={2}>
          <Card title={t('dashboard.trend')}>
            <LineChart
              labels={d.trend.map((r: any) => r.month)}
              series={[
                { label: t('dashboard.due'), values: d.trend.map((r: any) => r.due) },
                { label: t('dashboard.completed'), values: d.trend.map((r: any) => r.completed) },
                { label: t('dashboard.late'), values: d.trend.map((r: any) => r.late) },
              ]}
            />
          </Card>
          <Card title={t('dashboard.late_by_org')}>
            <BarChart
              labels={d.late_by_organization.map((r: any) => lx(r.organization_name))}
              series={[
                { label: t('dashboard.late'), values: d.late_by_organization.map((r: any) => r.late) },
                { label: t('dashboard.prev_late'), values: d.late_by_organization.map((r: any) => r.prev_late) },
              ]}
            />
          </Card>
        </Grid>
        <Card title={t('dashboard.by_org')}>
          <Table
            empty={t('common.none')}
            rowKey={(r) => r.organization_id}
            rows={d.by_organization}
            columns={[
              { key: 'organization_name', label: t('common.organization'), render: (r) => lx(r.organization_name) },
              { key: 'total', label: t('common.total'), align: 'right' },
              { key: 'done', label: t('dashboard.tasks_done'), align: 'right' },
              { key: 'in_progress', label: t('dashboard.tasks_open'), align: 'right' },
              { key: 'overdue', label: t('dashboard.tasks_overdue'), align: 'right' },
              { key: 'completion_pct', label: `${t('dashboard.completion')}, %`, align: 'right', render: (r) => fmtNum(r.completion_pct) },
            ]}
          />
        </Card>
        {kpi.behind_plan.length > 0 && (
          <Card title={t('dashboard.kpi_behind')}>
            <Table
              empty={t('common.none')}
              rowKey={(r) => r.kpi_definition_id}
              rows={kpi.behind_plan}
              columns={[
                { key: 'kpi_name', label: t('common.name'), render: (r) => <a className="text-accent" href={`/kpi/${r.kpi_definition_id}`}>{lx(r.kpi_name)}</a> },
                { key: 'organization_name', label: t('common.organization'), render: (r) => lx(r.organization_name) },
                { key: 'period_start', label: t('common.period'), render: (r) => fmtDate(r.period_start) },
                { key: 'planned_value', label: t('kpi.planned'), align: 'right', render: (r) => fmtNum(r.planned_value) },
                { key: 'actual_value', label: t('kpi.actual'), align: 'right', render: (r) => fmtNum(r.actual_value) },
                { key: 'attainment_pct', label: t('kpi.attainment'), align: 'right', render: (r) => fmtNum(r.attainment_pct) },
              ]}
            />
          </Card>
        )}
        <Notice>{t('dashboard.kpi_note')}</Notice>
      </div>
    </>
  );
}

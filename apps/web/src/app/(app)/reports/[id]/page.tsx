import { LOCALES } from '@govmind/i18n';
import { BarChart } from '@/components/charts';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Grid, Notice, PageHeader, Stat, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { transitionReport } from '../actions';

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { t, lx, fmtNum, fmtDate, locale } = await getT();
  const [r, canExport, canApprove] = await Promise.all([api(`/reports/${id}`), can('reports.export'), can('reports.approve')]);
  const c = r.content;
  return (
    <>
      <PageHeader
        title={`${lx(r.organization_name)} — ${t(`reports.type.${r.report_type}` as any)}`}
        subtitle={`${fmtDate(r.period_start)} — ${fmtDate(r.period_end)} · ${t(`reports.status.${r.status}` as any)}`}
        actions={
          canExport && (
            <div className="flex flex-wrap gap-2">
              {(['pdf', 'xlsx', 'docx'] as const).map((f) => (
                <a key={f} className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2" href={`/download/reports/${id}?format=${f}&lang=${locale}`}>
                  {f.toUpperCase()}
                </a>
              ))}
            </div>
          )
        }
      />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        {canExport && (
          <p className="text-xs text-muted">
            {t('common.export')}:{' '}
            {LOCALES.map((l) => (
              <a key={l} className="mr-2 text-accent" href={`/download/reports/${id}?format=pdf&lang=${l}`}>
                PDF {t(`lang.${l}` as any)}
              </a>
            ))}
          </p>
        )}
        <Grid cols={4}>
          <Stat label={t('dashboard.tasks_total')} value={fmtNum(c.summary.total, 0)} />
          <Stat label={t('dashboard.tasks_done')} value={fmtNum(c.summary.done, 0)} tone="ok" />
          <Stat label={t('dashboard.tasks_overdue')} value={fmtNum(c.summary.overdue, 0)} tone={c.summary.overdue ? 'danger' : undefined} />
          <Stat label={t('dashboard.on_time')} value={c.summary.on_time_pct === null ? '—' : `${fmtNum(c.summary.on_time_pct)}%`} />
        </Grid>
        {c.commentary && (
          <Card title={t('reports.ai_commentary')}>
            <p className="whitespace-pre-wrap text-sm">{c.commentary.text}</p>
            <p className="mt-2 text-xs text-muted">
              {t('reports.ai_disclaimer')} · {t('ai.model')}: {c.commentary.model_name} {c.commentary.model_version}
            </p>
          </Card>
        )}
        <Card title={t('reports.comparison')}>
          <BarChart
            labels={c.by_organization.map((o: any) => lx(o.organization_name))}
            series={[
              { label: t('dashboard.tasks_done'), values: c.by_organization.map((o: any) => o.done) },
              { label: t('dashboard.tasks_overdue'), values: c.by_organization.map((o: any) => o.overdue) },
            ]}
          />
          <Table
            empty={t('common.none')}
            rowKey={(o) => o.organization_id}
            rows={c.by_organization}
            columns={[
              { key: 'organization_name', label: t('common.organization'), render: (o) => lx(o.organization_name) },
              { key: 'total', label: t('common.total'), align: 'right' },
              { key: 'done', label: t('dashboard.tasks_done'), align: 'right' },
              { key: 'overdue', label: t('dashboard.tasks_overdue'), align: 'right' },
              { key: 'completion_pct', label: `${t('dashboard.completion')}, %`, align: 'right', render: (o) => fmtNum(o.completion_pct) },
            ]}
          />
        </Card>
        {c.kpi_behind_plan.length > 0 && (
          <Card title={t('dashboard.kpi_behind')}>
            <Table
              empty={t('common.none')}
              rowKey={(k) => k.kpi_definition_id}
              rows={c.kpi_behind_plan}
              columns={[
                { key: 'kpi_name', label: t('common.name'), render: (k) => lx(k.kpi_name) },
                { key: 'organization_name', label: t('common.organization'), render: (k) => lx(k.organization_name) },
                { key: 'planned_value', label: t('kpi.planned'), align: 'right', render: (k) => fmtNum(k.planned_value) },
                { key: 'actual_value', label: t('kpi.actual'), align: 'right', render: (k) => fmtNum(k.actual_value) },
                { key: 'attainment_pct', label: t('kpi.attainment'), align: 'right', render: (k) => <Badge tone="warn">{fmtNum(k.attainment_pct)}%</Badge> },
              ]}
            />
          </Card>
        )}
        <div className="flex flex-wrap gap-2">
          {r.status === 'draft' && (
            <form action={transitionReport}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={r.version} />
              <input type="hidden" name="to" value="submit" />
              <Button variant="secondary">{t('reports.submit_review')}</Button>
            </form>
          )}
          {r.status === 'review' && canApprove && (
            <form action={transitionReport}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={r.version} />
              <input type="hidden" name="to" value="approve" />
              <Button>{t('common.approve')}</Button>
            </form>
          )}
        </div>
        {r.approved_by_name && <Notice tone="ok">{`${t('reports.status.approved')}: ${r.approved_by_name}`}</Notice>}
      </div>
    </>
  );
}

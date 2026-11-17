import { LineChart } from '@/components/charts';
import { ErrorNotice } from '@/components/error-notice';
import { Button, Card, Field, Grid, Input, Notice, PageHeader, Stat, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { recordValue, runForecast } from '../actions';

export default async function KpiDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { t, lx, fmtNum, fmtDate } = await getT();
  const [k, canManage, canForecast] = await Promise.all([api(`/kpi/definitions/${id}`), can('kpi.manage'), can('ai.forecast')]);
  const m = k.measurements as any[];
  const fc = (k.forecasts as any[])[0];
  const fcPoints = (fc?.points ?? []) as any[];
  const labels = [...m.map((x) => String(x.period_start).slice(0, 7)), ...fcPoints.map((p) => p.period.slice(0, 7))];
  const pad = (n: number) => Array(n).fill(null);
  return (
    <>
      <PageHeader title={lx(k.name)} subtitle={`${lx(k.organization_name)} · ${t(`kpi.period.${k.period}` as any)} · ${k.unit ?? ''}`} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Card title={`${t('kpi.history')} / ${t('forecast.title')}`}>
          <LineChart
            labels={labels}
            splitAt={fc ? m.length - 1 : undefined}
            series={[
              { label: t('kpi.actual'), values: [...m.map((x) => (x.actual_value === null ? null : Number(x.actual_value))), ...pad(fcPoints.length)] },
              { label: t('forecast.title'), values: [...pad(m.length ? m.length - 1 : 0), ...(m.length ? [Number(m[m.length - 1].actual_value)] : []), ...fcPoints.map((p) => p.value)] },
              { label: t('kpi.planned'), values: [...m.map((x) => (x.planned_value === null ? null : Number(x.planned_value))), ...pad(fcPoints.length)] },
            ]}
            band={fc ? { lower: [...pad(m.length), ...fcPoints.map((p) => p.lower)], upper: [...pad(m.length), ...fcPoints.map((p) => p.upper)] } : undefined}
          />
        </Card>
        {fc && (
          <section id="forecast" className="space-y-3">
            <Grid cols={4}>
              <Stat label={t('forecast.method')} value={<span className="text-base">{fc.method}</span>} />
              <Stat label={t('forecast.mae')} value={fmtNum(fc.metrics.mae)} />
              <Stat label={t('forecast.mape')} value={fc.metrics.mape === null ? '—' : `${fmtNum(fc.metrics.mape)}%`} />
              <Stat label={t('forecast.scenario')} value={fc.scenario ? `${fc.scenario.change_pct}%` : '—'} />
            </Grid>
            <Notice>{t('forecast.note')} {t('forecast.interval')}.</Notice>
          </section>
        )}
        <Grid cols={2}>
          {canForecast && (
            <Card title={t('forecast.run')}>
              <form action={runForecast} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={id} />
                <Field label={t('forecast.horizon')}>
                  <Input type="number" name="horizon" min={1} max={36} defaultValue={6} />
                </Field>
                <Field label={t('forecast.scenario')}>
                  <Input type="number" name="change_pct" step="any" min={-90} max={500} placeholder="0" />
                </Field>
                <div className="flex items-end">
                  <Button>{t('forecast.run')}</Button>
                </div>
              </form>
            </Card>
          )}
          {canManage && (
            <Card title={t('kpi.record')}>
              <form action={recordValue} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <Field label={t('common.period')}>
                  <Input type="date" name="period_start" required />
                </Field>
                <Field label={t('kpi.source')}>
                  <Input name="source" required minLength={2} />
                </Field>
                <Field label={t('kpi.planned')}>
                  <Input name="planned_value" inputMode="decimal" />
                </Field>
                <Field label={t('kpi.actual')}>
                  <Input name="actual_value" inputMode="decimal" />
                </Field>
                <div className="sm:col-span-2">
                  <Button>{t('common.save')}</Button>
                </div>
              </form>
            </Card>
          )}
        </Grid>
        <Card title={t('kpi.history')}>
          <Table
            empty={t('common.none')}
            rows={[...m].reverse()}
            columns={[
              { key: 'period_start', label: t('common.period'), render: (r) => fmtDate(r.period_start) },
              { key: 'planned_value', label: t('kpi.planned'), align: 'right', render: (r) => fmtNum(r.planned_value) },
              { key: 'actual_value', label: t('kpi.actual'), align: 'right', render: (r) => fmtNum(r.actual_value) },
              { key: 'pct', label: t('kpi.attainment'), align: 'right', render: (r) => (r.planned_value && r.actual_value ? fmtNum((100 * r.actual_value) / r.planned_value) : '—') },
              { key: 'source', label: t('kpi.source') },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

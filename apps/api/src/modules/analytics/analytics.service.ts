import { Injectable } from '@nestjs/common';
import { rows, one, Tx } from '../../common/db/db.service';

export interface Period {
  from: string;
  to: string;
}

/**
 * Faqat oldindan belgilangan, parametrlangan, read-only so'rovlar.
 * AI ham, dashboard ham shu katalogdan foydalanadi — cheklanmagan SQL yo'q.
 */
@Injectable()
export class AnalyticsService {
  async summary(tx: Tx, period: Period, orgId?: string | null) {
    return one(
      tx,
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'done')::int AS done,
              count(*) FILTER (WHERE status IN ('new','in_progress'))::int AS open,
              count(*) FILTER (WHERE status IN ('new','in_progress') AND deadline < now())::int AS overdue,
              count(*) FILTER (WHERE status = 'done' AND completed_at > deadline)::int AS done_late,
              round(100.0 * count(*) FILTER (WHERE status = 'done' AND (deadline IS NULL OR completed_at <= deadline))
                    / NULLIF(count(*) FILTER (WHERE status = 'done'), 0), 1) AS on_time_pct
       FROM core.tasks
       WHERE deadline >= $1::date AND deadline < $2::date + 1 AND ($3::uuid IS NULL OR organization_id = $3)`,
      [period.from, period.to, orgId ?? null],
    );
  }

  /** Tashkilotlar kesimida kechikishlar, oldingi teng davr bilan taqqoslab. */
  async lateByOrganization(tx: Tx, period: Period) {
    return rows(
      tx,
      `WITH bounds AS (
         SELECT $1::date AS f, $2::date + 1 AS t, ($2::date + 1 - $1::date) AS len
       ), cur AS (
         SELECT organization_id,
                count(*) FILTER (WHERE (status = 'done' AND completed_at > deadline)
                                    OR (status IN ('new','in_progress') AND deadline < now()))::int AS late,
                count(*)::int AS total
         FROM core.tasks, bounds WHERE deadline >= f AND deadline < t GROUP BY organization_id
       ), prev AS (
         SELECT organization_id,
                count(*) FILTER (WHERE (status = 'done' AND completed_at > deadline)
                                    OR (status IN ('new','in_progress') AND deadline < now()))::int AS late,
                count(*)::int AS total
         FROM core.tasks, bounds WHERE deadline >= f - len AND deadline < f GROUP BY organization_id
       )
       SELECT o.id AS organization_id, o.name AS organization_name,
              COALESCE(cur.total, 0) AS total, COALESCE(cur.late, 0) AS late,
              round(100.0 * COALESCE(cur.late, 0) / NULLIF(cur.total, 0), 1) AS late_pct,
              COALESCE(prev.late, 0) AS prev_late,
              round(100.0 * COALESCE(prev.late, 0) / NULLIF(prev.total, 0), 1) AS prev_late_pct
       FROM organization.organizations o
       LEFT JOIN cur ON cur.organization_id = o.id LEFT JOIN prev ON prev.organization_id = o.id
       WHERE cur.total IS NOT NULL OR prev.total IS NOT NULL
       ORDER BY late DESC, o.name`,
      [period.from, period.to],
    );
  }

  async statusByOrganization(tx: Tx, period: Period) {
    return rows(
      tx,
      `SELECT o.id AS organization_id, o.name AS organization_name,
              count(t.*)::int AS total,
              count(*) FILTER (WHERE t.status = 'done')::int AS done,
              count(*) FILTER (WHERE t.status = 'in_progress')::int AS in_progress,
              count(*) FILTER (WHERE t.status = 'new')::int AS new,
              count(*) FILTER (WHERE t.status IN ('new','in_progress') AND t.deadline < now())::int AS overdue,
              round(100.0 * count(*) FILTER (WHERE t.status = 'done') / NULLIF(count(t.*), 0), 1) AS completion_pct
       FROM organization.organizations o
       JOIN core.tasks t ON t.organization_id = o.id AND t.deadline >= $1::date AND t.deadline < $2::date + 1
       GROUP BY o.id ORDER BY o.name`,
      [period.from, period.to],
    );
  }

  /** Rejadan ortda qolayotgan KPI'lar (eng oxirgi davr bo'yicha). */
  async kpiBehindPlan(tx: Tx, thresholdPct = 95) {
    return rows(
      tx,
      `SELECT d.id AS kpi_definition_id, d.name AS kpi_name, d.unit, o.name AS organization_name, d.direction,
              m.period_start, m.planned_value, m.actual_value,
              round(100 * m.actual_value / NULLIF(m.planned_value, 0), 1) AS attainment_pct
       FROM analytics.kpi_definitions d
       JOIN organization.organizations o ON o.id = d.organization_id
       JOIN LATERAL (SELECT * FROM analytics.kpi_measurements k WHERE k.kpi_definition_id = d.id
                       AND k.planned_value IS NOT NULL AND k.actual_value IS NOT NULL
                     ORDER BY period_start DESC LIMIT 1) m ON true
       WHERE (d.direction = 'higher' AND m.actual_value < m.planned_value * $1 / 100.0)
          OR (d.direction = 'lower' AND m.actual_value > m.planned_value * (200 - $1) / 100.0)
       ORDER BY attainment_pct NULLS LAST`,
      [thresholdPct],
    );
  }

  /** Ikki oyni KPI bo'yicha taqqoslash. */
  async kpiCompareMonths(tx: Tx, monthA: string, monthB: string) {
    return rows(
      tx,
      `SELECT d.id AS kpi_definition_id, d.name AS kpi_name, o.name AS organization_name, d.unit,
              a.actual_value AS value_a, b.actual_value AS value_b,
              round(100 * (b.actual_value - a.actual_value) / NULLIF(a.actual_value, 0), 1) AS change_pct
       FROM analytics.kpi_definitions d JOIN organization.organizations o ON o.id = d.organization_id
       LEFT JOIN analytics.kpi_measurements a ON a.kpi_definition_id = d.id AND a.period_start = date_trunc('month', $1::date)::date
       LEFT JOIN analytics.kpi_measurements b ON b.kpi_definition_id = d.id AND b.period_start = date_trunc('month', $2::date)::date
       WHERE a.id IS NOT NULL OR b.id IS NOT NULL
       ORDER BY o.name, d.name`,
      [monthA, monthB],
    );
  }

  /** Oylar bo'yicha yaratilgan/bajarilgan dinamikasi. */
  async monthlyTrend(tx: Tx, months = 12) {
    return rows(
      tx,
      `WITH m AS (SELECT generate_series(date_trunc('month', now()) - make_interval(months => $1 - 1),
                                         date_trunc('month', now()), interval '1 month')::date AS month)
       SELECT to_char(m.month, 'YYYY-MM') AS month,
              (SELECT count(*) FROM core.tasks t WHERE date_trunc('month', t.deadline) = m.month)::int AS due,
              (SELECT count(*) FROM core.tasks t WHERE date_trunc('month', t.completed_at) = m.month)::int AS completed,
              (SELECT count(*) FROM core.tasks t WHERE date_trunc('month', t.deadline) = m.month
                 AND ((t.status = 'done' AND t.completed_at > t.deadline)
                      OR (t.status IN ('new','in_progress') AND t.deadline < now())))::int AS late
       FROM m ORDER BY m.month`,
      [months],
    );
  }

  async latestReport(tx: Tx, reportType?: string | null) {
    return rows(
      tx,
      `SELECT r.id, r.report_type, r.period_start, r.period_end, r.status, o.name AS organization_name, r.created_at
       FROM core.reports r JOIN organization.organizations o ON o.id = r.organization_id
       WHERE ($1::text IS NULL OR r.report_type = $1) ORDER BY r.period_end DESC, r.created_at DESC LIMIT 5`,
      [reportType ?? null],
    );
  }

  async kpiSeries(tx: Tx, definitionId: string) {
    return rows<{ period: string; value: number }>(
      tx,
      `SELECT to_char(period_start, 'YYYY-MM-DD') AS period, actual_value::float AS value
       FROM analytics.kpi_measurements WHERE kpi_definition_id = $1 AND actual_value IS NOT NULL ORDER BY period_start`,
      [definitionId],
    );
  }
}

/** AI Analyst uchun so'rovlar katalogi: kod -> bajaruvchi. */
export type CatalogParams = Record<string, unknown>;

export function defaultPeriod(days = 90): Period {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function quarterPeriod(offset = 0, now = new Date()): Period {
  // offset=0 — oxirgi tugagan chorak emas, joriy chorak; -1 — oldingi chorak
  const q = Math.floor(now.getUTCMonth() / 3) + offset;
  const year = now.getUTCFullYear() + Math.floor(q / 4);
  const qi = ((q % 4) + 4) % 4;
  const from = new Date(Date.UTC(year, qi * 3, 1));
  const to = new Date(Date.UTC(year, qi * 3 + 3, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function monthStart(offset = 0, now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
}

export function runCatalogQuery(svc: AnalyticsService, tx: Tx, code: string, params: CatalogParams) {
  const period = (params.from && params.to ? { from: String(params.from), to: String(params.to) } : null) as Period | null;
  switch (code) {
    case 'tasks.late_by_org':
      return svc.lateByOrganization(tx, period ?? quarterPeriod(-1));
    case 'tasks.status_by_org':
      return svc.statusByOrganization(tx, period ?? defaultPeriod(90));
    case 'tasks.monthly_trend':
      return svc.monthlyTrend(tx, Number(params.months ?? 12));
    case 'kpi.behind_plan':
      return svc.kpiBehindPlan(tx, Number(params.threshold_pct ?? 95));
    case 'kpi.compare_months':
      return svc.kpiCompareMonths(tx, String(params.month_a ?? monthStart(-1)), String(params.month_b ?? monthStart(0)));
    case 'reports.latest':
      return svc.latestReport(tx, (params.report_type as string) ?? null);
    default:
      return null;
  }
}

export const CATALOG_CODES = [
  'tasks.late_by_org', 'tasks.status_by_org', 'tasks.monthly_trend', 'kpi.behind_plan', 'kpi.compare_months', 'reports.latest',
] as const;

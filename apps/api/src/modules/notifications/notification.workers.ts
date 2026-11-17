import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { AiEngineClient } from '../../common/ai/ai-engine.client';
import { DbService, rows, Tx } from '../../common/db/db.service';
import { backoffSeconds, IntervalWorker } from '../../common/workers/interval-worker';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationChannels } from './channels';

const MAX_ATTEMPTS = 8;

/** Muddat, kechikish va AI aniqlagan og'ishlar bo'yicha bildirishnomalar yaratadi. */
@Injectable()
export class NotificationScheduler extends IntervalWorker {
  protected readonly intervalMs = 5 * 60_000;
  protected readonly enabled: boolean;

  constructor(
    private readonly db: DbService,
    private readonly ai: AiEngineClient,
    private readonly analytics: AnalyticsService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    super();
    this.enabled = config.workersEnabled;
  }

  async tick() {
    await this.db.system(async (tx) => {
      const lock = await tx.query("SELECT pg_try_advisory_xact_lock(hashtext('govmind.notification_scheduler')) AS ok");
      if (!lock.rows[0].ok) return;
      await this.deadlines(tx);
      await this.kpiDeviations(tx);
      await this.planDeliveries(tx);
    });
    await this.anomalies();
  }

  async deadlines(tx: Tx) {
    // Muddatga 24 soat va 3 kun qolganda — mas'ullarga
    for (const [hours, key, sev] of [[24, 'due24', 'warning'], [72, 'due72', 'info']] as const) {
      await tx.query(
        `INSERT INTO core.notifications (user_id, organization_id, kind, severity, title, link, dedupe_key)
         SELECT a.user_id, t.organization_id, 'deadline', $2, 'Muddat yaqinlashmoqda: ' || left(t.title, 400),
                '/tasks/' || t.id, $3 || ':' || t.id || ':' || a.user_id
         FROM core.tasks t JOIN core.task_assignments a ON a.task_id = t.id
         WHERE t.status IN ('new','in_progress') AND t.deadline > now() AND t.deadline <= now() + make_interval(hours => $1)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [hours, sev, key],
      );
    }
    // Muddati o'tgan — mas'ullarga va topshiriq muallifiga
    await tx.query(
      `INSERT INTO core.notifications (user_id, organization_id, kind, severity, title, link, dedupe_key)
       SELECT DISTINCT ON (u.user_id, t.id) u.user_id, t.organization_id, 'overdue', 'warning',
              'Muddati o''tdi: ' || left(t.title, 400), '/tasks/' || t.id, 'overdue:' || t.id || ':' || u.user_id
       FROM core.tasks t
       JOIN LATERAL (SELECT a.user_id FROM core.task_assignments a WHERE a.task_id = t.id
                     UNION SELECT t.created_by) u ON true
       WHERE t.status IN ('new','in_progress') AND t.deadline < now() AND t.deadline > now() - interval '30 days'
       ON CONFLICT (dedupe_key) DO NOTHING`,
    );
  }

  /** Rejadan 20% dan ko'p ortda qolgan KPI — shu hudud rahbari va analitiklariga. */
  async kpiDeviations(tx: Tx) {
    const behind = await this.analytics.kpiBehindPlan(tx, 80);
    for (const k of behind as any[]) {
      await this.notifyScope(tx, k.kpi_definition_id, 'ai_finding', 'warning',
        `KPI rejadan ortda: ${k.kpi_name} (${k.attainment_pct}%)`, `/kpi/${k.kpi_definition_id}`,
        `kpi_behind:${k.kpi_definition_id}:${k.period_start}`);
    }
  }

  /** KPI qatorlaridagi statistik og'ishlar (AI engine). */
  async anomalies() {
    const defs = await this.db.system((tx) => rows<{ id: string; name: string }>(tx, 'SELECT id, name FROM analytics.kpi_definitions'));
    for (const d of defs) {
      const series = await this.db.system((tx) => this.analytics.kpiSeries(tx, d.id));
      if (series.length < 8) continue;
      const res = await this.ai.anomalies({ series }).catch(() => null);
      const last = res?.anomalies.find((a) => a.period === series[series.length - 1].period);
      if (!last) continue;
      await this.db.system((tx) =>
        this.notifyScope(tx, d.id, 'ai_finding', 'warning',
          `AI og'ish aniqladi: ${d.name} — ${last.period}: ${last.value} (kutilgan ≈ ${Math.round(last.expected)})`,
          `/kpi/${d.id}`, `anomaly:${d.id}:${last.period}`),
      );
    }
  }

  private async notifyScope(tx: Tx, kpiId: string, kind: string, severity: string, title: string, link: string, dedupe: string) {
    await tx.query(
      `INSERT INTO core.notifications (user_id, organization_id, kind, severity, title, link, dedupe_key)
       SELECT DISTINCT ur.user_id, d.organization_id, $2, $3, left($4, 500), $5, $6 || ':' || ur.user_id
       FROM analytics.kpi_definitions d
       JOIN organization.organizations o ON o.id = d.organization_id
       JOIN organization.administrative_units ou ON ou.id = o.administrative_unit_id
       JOIN iam.user_roles ur ON true
       JOIN organization.administrative_units gu ON gu.id = ur.administrative_unit_id AND ou.path <@ gu.path
       JOIN iam.role_permissions rp ON rp.role_id = ur.role_id
       JOIN iam.permissions pm ON pm.id = rp.permission_id AND pm.code = 'ai.forecast'
       JOIN iam.users u ON u.id = ur.user_id AND u.status = 'active'
       WHERE d.id = $1 AND ur.valid_from <= now() AND (ur.valid_until IS NULL OR ur.valid_until > now())
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [kpiId, kind, severity, title, link, dedupe],
    );
  }

  /** Yangi bildirishnomalar uchun foydalanuvchi sozlamalariga ko'ra email/Telegram navbati. */
  async planDeliveries(tx: Tx) {
    await tx.query(
      `INSERT INTO core.notification_deliveries (notification_id, channel)
       SELECT n.id, ch.channel
       FROM core.notifications n
       JOIN iam.users u ON u.id = n.user_id
       LEFT JOIN core.notification_preferences pr ON pr.user_id = n.user_id
       CROSS JOIN LATERAL (VALUES
         ('email', COALESCE(pr.email_enabled, true) AND u.email IS NOT NULL),
         ('telegram', COALESCE(pr.telegram_enabled, false) AND pr.telegram_chat_id IS NOT NULL)) ch(channel, wanted)
       WHERE n.created_at > now() - interval '1 day' AND ch.wanted
         AND array_position(ARRAY['info','warning','critical'], n.severity)
             >= array_position(ARRAY['info','warning','critical'], COALESCE(pr.min_severity, 'info'))
       ON CONFLICT (notification_id, channel) DO NOTHING`,
    );
  }
}

/** Email va Telegram orqali yetkazish, qayta urinish va exponential backoff bilan. */
@Injectable()
export class NotificationDelivery extends IntervalWorker {
  protected readonly intervalMs = 30_000;
  protected readonly enabled: boolean;

  constructor(
    private readonly db: DbService,
    private readonly channels: NotificationChannels,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    super();
    this.enabled = config.workersEnabled;
  }

  async tick() {
    const due = await this.db.system((tx) =>
      rows<{ id: string; channel: 'email' | 'telegram'; attempts: number; title: string; body: string | null; link: string | null; email: string | null; chat: string | null }>(
        tx,
        // Navbatdan olish: yozuvlar 5 daqiqaga "band" qilinadi — boshqa nusxa ularni olmaydi.
        `WITH claimed AS (
           UPDATE core.notification_deliveries SET next_attempt_at = now() + interval '5 minutes'
           WHERE id IN (SELECT id FROM core.notification_deliveries WHERE status = 'pending' AND next_attempt_at <= now()
                        ORDER BY next_attempt_at LIMIT 50 FOR UPDATE SKIP LOCKED)
           RETURNING id, notification_id, channel, attempts)
         SELECT d.id, d.channel, d.attempts, n.title, n.body, n.link, u.email, pr.telegram_chat_id AS chat
         FROM claimed d
         JOIN core.notifications n ON n.id = d.notification_id
         JOIN iam.users u ON u.id = n.user_id
         LEFT JOIN core.notification_preferences pr ON pr.user_id = n.user_id`,
      ),
    );
    for (const d of due) {
      const configured = d.channel === 'email' ? this.channels.emailConfigured : this.channels.telegramConfigured;
      if (!configured) {
        await this.mark(d.id, 'skipped', 'channel not configured');
        continue;
      }
      try {
        const msg = { title: d.title, body: d.body, link: d.link };
        if (d.channel === 'email') await this.channels.email(d.email!, msg);
        else await this.channels.telegram(d.chat!, msg);
        await this.mark(d.id, 'sent');
      } catch (err) {
        const attempts = d.attempts + 1;
        const error = err instanceof Error ? err.message : String(err);
        await this.db.system((tx) =>
          tx.query(
            `UPDATE core.notification_deliveries SET attempts = $2, last_error = $3,
               status = CASE WHEN $2 >= $4 THEN 'failed' ELSE 'pending' END,
               next_attempt_at = now() + make_interval(secs => $5) WHERE id = $1`,
            [d.id, attempts, error.slice(0, 500), MAX_ATTEMPTS, backoffSeconds(attempts)],
          ),
        );
      }
    }
  }

  private mark(id: string, status: 'sent' | 'skipped', error?: string) {
    return this.db.system((tx) =>
      tx.query(
        `UPDATE core.notification_deliveries SET status = $2::text, last_error = $3, sent_at = CASE WHEN $2::text = 'sent' THEN now() END WHERE id = $1`,
        [id, status, error ?? null],
      ),
    );
  }
}

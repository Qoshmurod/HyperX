import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { CryptoService } from '../../common/crypto/crypto.service';
import { DbService, rows } from '../../common/db/db.service';
import { backoffSeconds, IntervalWorker } from '../../common/workers/interval-worker';
import { assertWebhookUrl, signWebhook } from './webhook-security';

const MAX_ATTEMPTS = 10;

/** Webhook yetkazish: HMAC imzo, idempotentlik uchun X-GovMind-Delivery, qayta urinish. */
@Injectable()
export class WebhookWorker extends IntervalWorker {
  protected readonly intervalMs = 15_000;
  protected readonly enabled: boolean;

  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    super();
    this.enabled = config.workersEnabled;
  }

  async tick() {
    const due = await this.db.system((tx) =>
      rows<{ id: string; event_id: string; event_type: string; payload: unknown; attempts: number; url: string; secret_enc: string }>(
        tx,
        `WITH claimed AS (
           UPDATE integration.webhook_deliveries SET next_attempt_at = now() + interval '5 minutes'
           WHERE id IN (SELECT id FROM integration.webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= now()
                        ORDER BY next_attempt_at LIMIT 50 FOR UPDATE SKIP LOCKED)
           RETURNING id, webhook_id, event_id, event_type, payload, attempts)
         SELECT c.id, c.event_id, c.event_type, c.payload, c.attempts, w.url, w.secret_enc
         FROM claimed c JOIN integration.webhooks w ON w.id = c.webhook_id`,
      ),
    );
    for (const d of due) await this.deliver(d);
  }

  private async deliver(d: { id: string; event_id: string; event_type: string; payload: unknown; attempts: number; url: string; secret_enc: string }) {
    const body = JSON.stringify(d.payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    let status: number | null = null;
    let error: string | null = null;
    try {
      assertWebhookUrl(d.url);
      const res = await fetch(d.url, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GovMind-Webhooks/1',
          'X-GovMind-Event': d.event_type,
          'X-GovMind-Delivery': d.event_id,
          'X-GovMind-Timestamp': ts,
          'X-GovMind-Signature': signWebhook(this.crypto.decryptString(d.secret_enc), ts, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const attempts = d.attempts + 1;
    await this.db.system((tx) =>
      tx.query(
        `UPDATE integration.webhook_deliveries SET attempts = $2, response_status = $3, last_error = $4,
           status = CASE WHEN $4::text IS NULL THEN 'delivered' WHEN $2 >= $5 THEN 'failed' ELSE 'pending' END,
           delivered_at = CASE WHEN $4::text IS NULL THEN now() END,
           next_attempt_at = now() + make_interval(secs => $6)
         WHERE id = $1`,
        [d.id, attempts, status, error?.slice(0, 500) ?? null, MAX_ATTEMPTS, backoffSeconds(attempts)],
      ),
    );
  }
}

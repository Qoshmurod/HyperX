import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { DbService, one, rows } from '../../common/db/db.service';
import { backoffSeconds, IntervalWorker } from '../../common/workers/interval-worker';
import { SyncEvent } from './sync-apply';
import { SyncService } from './sync.service';

const BATCH = 200;

/**
 * Internet bo'lmasa o'zgarishlar outbox'da qoladi; aloqa tiklanganda yuqori tugunga yuboriladi
 * (push) va yuqoridan quyi tugunga tegishli o'zgarishlar olinadi (pull).
 */
@Injectable()
export class SyncDispatcher extends IntervalWorker {
  protected readonly intervalMs = 20_000;
  protected readonly enabled: boolean;

  constructor(
    private readonly db: DbService,
    private readonly sync: SyncService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
    this.enabled = config.workersEnabled && !!config.upstream;
  }

  async tick() {
    if (!this.config.upstream) return;
    await this.push();
    await this.pull();
  }

  private headers() {
    return { 'Content-Type': 'application/json', 'X-Node-Token': this.config.upstream!.token };
  }

  async push(): Promise<number> {
    const batch = await this.db.system((tx) =>
      rows<SyncEvent & { attempts: number }>(
        tx,
        `WITH claimed AS (
           UPDATE sync.sync_events SET next_attempt_at = now() + interval '2 minutes'
           WHERE event_id IN (SELECT event_id FROM sync.sync_events WHERE status IN ('pending','failed') AND next_attempt_at <= now()
                              ORDER BY seq LIMIT $1 FOR UPDATE SKIP LOCKED)
           RETURNING *)
         SELECT event_id, source_node_id, resource_type, resource_id, operation, base_version, new_version, payload,
                admin_unit_path::text AS admin_unit_path, attempts
         FROM claimed ORDER BY seq`,
        [BATCH],
      ),
    );
    if (batch.length === 0) return 0;
    try {
      const res = await fetch(`${this.config.upstream!.url}/api/v1/sync/events`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ events: batch.map(({ attempts: _a, ...e }) => e) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
      const { results } = (await res.json()) as { results: { event_id: string; outcome: string; detail?: string }[] };
      await this.db.system(async (tx) => {
        for (const r of results) {
          await tx.query(
            `UPDATE sync.sync_events SET status = $2, last_error = $3, attempts = attempts + 1 WHERE event_id = $1`,
            [r.event_id, r.outcome === 'conflict' ? 'conflict' : 'acknowledged', r.outcome === 'applied' || r.outcome === 'skipped' ? null : `${r.outcome}: ${r.detail ?? ''}`],
          );
        }
      });
      return results.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db.system(async (tx) => {
        for (const e of batch) {
          await tx.query(
            `UPDATE sync.sync_events SET status = 'failed', attempts = attempts + 1, last_error = $2,
               next_attempt_at = now() + make_interval(secs => $3) WHERE event_id = $1`,
            [e.event_id, msg.slice(0, 500), backoffSeconds(e.attempts + 1, 900)],
          );
        }
      });
      this.logger.warn(`push failed (${batch.length} events queued): ${msg}`);
      return 0;
    }
  }

  async pull(): Promise<number> {
    const url = this.config.upstream!.url;
    const cursor = await this.db.system(async (tx) => {
      await tx.query('INSERT INTO sync.cursors (upstream_url) VALUES ($1) ON CONFLICT DO NOTHING', [url]);
      return (await one<{ last_seq: string }>(tx, 'SELECT last_seq FROM sync.cursors WHERE upstream_url = $1', [url]))!.last_seq;
    });
    let res: Response;
    try {
      res = await fetch(`${url}/api/v1/sync/feed?after=${cursor}&limit=${BATCH}`, { headers: this.headers(), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(`pull failed: ${err instanceof Error ? err.message : err}`);
      return 0;
    }
    const { events } = (await res.json()) as { events: (SyncEvent & { seq: number })[] };
    if (events.length === 0) return 0;
    await this.sync.receive(events, { nodeId: 'upstream', level: 'central', path: this.config.rootPath, trustedUpstream: true });
    const last = events[events.length - 1].seq;
    await this.db.system((tx) => tx.query('UPDATE sync.cursors SET last_seq = $2, updated_at = now() WHERE upstream_url = $1', [url, last]));
    return events.length;
  }
}

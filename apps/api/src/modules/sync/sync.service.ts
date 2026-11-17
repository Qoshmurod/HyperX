import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, AppConfig, NodeLevel } from '../../config';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal } from '../../common/auth/principal';
import { DbService, one, rows, Tx } from '../../common/db/db.service';
import { applyEvent, authorize, forward, Outcome, RESOURCES, SyncEvent, upsert } from './sync-apply';

export interface Sender {
  nodeId: string;
  level: NodeLevel;
  path: string;
  trustedUpstream: boolean;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Hodisalar paketini qabul qilish. Har bir hodisa alohida tranzaksiyada:
   * inbox'dagi event_id PRIMARY KEY takroriy qo'llashni imkonsiz qiladi.
   */
  async receive(events: SyncEvent[], sender: Sender): Promise<{ event_id: string; outcome: Outcome; detail?: string }[]> {
    const results: { event_id: string; outcome: Outcome; detail?: string }[] = [];
    for (const e of events) {
      try {
        results.push(await this.db.system((tx) => this.receiveOne(tx, e, sender)));
      } catch (err) {
        // Masalan, RLS: hodisa ushbu tugun doirasidan tashqarida.
        const detail = err instanceof Error ? err.message.slice(0, 300) : 'error';
        await this.db
          .system((tx) =>
            tx.query(
              `INSERT INTO sync.inbox_events (event_id, source_node_id, resource_type, resource_id, outcome, detail)
               VALUES ($1, $2, $3, $4, 'rejected', $5) ON CONFLICT (event_id) DO NOTHING`,
              [e.event_id, e.source_node_id, e.resource_type, e.resource_id, detail],
            ),
          )
          .catch(() => undefined);
        results.push({ event_id: e.event_id, outcome: 'rejected', detail });
      }
    }
    return results;
  }

  private async receiveOne(tx: Tx, e: SyncEvent, sender: Sender) {
    const inserted = await one(
      tx,
      `INSERT INTO sync.inbox_events (event_id, source_node_id, resource_type, resource_id, outcome)
       VALUES ($1, $2, $3, $4, 'skipped') ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [e.event_id, e.source_node_id, e.resource_type, e.resource_id],
    );
    if (!inserted) return { event_id: e.event_id, outcome: 'skipped' as const, detail: 'duplicate' };

    const denied = await authorize(tx, e, sender);
    let result: { outcome: Outcome; detail?: string };
    if (denied) {
      result = { outcome: 'rejected', detail: denied };
    } else {
      await tx.query('SAVEPOINT apply_event');
      try {
        result = await applyEvent(tx, e);
        await tx.query('RELEASE SAVEPOINT apply_event');
      } catch (err) {
        await tx.query('ROLLBACK TO SAVEPOINT apply_event');
        result = { outcome: 'rejected', detail: err instanceof Error ? err.message.slice(0, 300) : 'error' };
      }
    }
    await tx.query('UPDATE sync.inbox_events SET outcome = $2, detail = $3 WHERE event_id = $1', [e.event_id, result.outcome, result.detail ?? null]);
    // Quyi tugundan kelgan qo'llangan hodisa yuqori tugunga uzatiladi.
    if (result.outcome === 'applied' && !sender.trustedUpstream && this.config.upstream) await forward(tx, e);
    return { event_id: e.event_id, ...result };
  }

  /** Quyi tugun uchun: uning hududiga tegishli (yoki uning ota hududlari) hodisalar. */
  feed(node: AuthPrincipal, after: number, limit: number) {
    const path = node.grants[0].scopePath;
    return this.db.system((tx) =>
      rows(
        tx,
        `SELECT seq, event_id, source_node_id, resource_type, resource_id, operation, base_version, new_version, payload,
                admin_unit_path::text AS admin_unit_path
         FROM sync.sync_events
         WHERE seq > $1 AND source_node_id <> $2
           AND (admin_unit_path <@ $3::ltree OR $3::ltree <@ admin_unit_path)
         ORDER BY seq LIMIT $4`,
        [after, node.id, path, limit],
      ),
    );
  }

  status() {
    return this.db.system(async (tx) => ({
      node_id: this.config.nodeId,
      node_level: this.config.nodeLevel,
      upstream: this.config.upstream?.url ?? null,
      outbox: await one(
        tx,
        `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
                count(*) FILTER (WHERE status = 'failed')::int AS failed,
                count(*) FILTER (WHERE status = 'conflict')::int AS conflict,
                count(*) FILTER (WHERE status = 'acknowledged')::int AS acknowledged,
                max(created_at) FILTER (WHERE status = 'acknowledged') AS last_acknowledged_at,
                min(created_at) FILTER (WHERE status IN ('pending','failed')) AS oldest_pending_at
         FROM sync.sync_events`,
      ),
      inbox: await one(
        tx,
        `SELECT count(*) FILTER (WHERE outcome = 'applied')::int AS applied,
                count(*) FILTER (WHERE outcome = 'rejected')::int AS rejected,
                count(*) FILTER (WHERE outcome = 'conflict')::int AS conflict,
                max(received_at) AS last_received_at
         FROM sync.inbox_events`,
      ),
      open_conflicts: (await one<{ n: number }>(tx, "SELECT count(*)::int AS n FROM sync.conflicts WHERE status = 'open'"))!.n,
      cursors: await rows(tx, 'SELECT upstream_url, last_seq, updated_at FROM sync.cursors'),
      recent_errors: await rows(
        tx,
        `SELECT event_id, resource_type, attempts, last_error, next_attempt_at FROM sync.sync_events
         WHERE last_error IS NOT NULL AND status IN ('pending','failed') ORDER BY next_attempt_at LIMIT 20`,
      ),
    }));
  }

  conflicts(status = 'open') {
    return this.db.system((tx) =>
      rows(
        tx,
        `SELECT c.id, c.event_id, c.resource_type, c.resource_id, c.local_version, c.incoming_base_version,
                c.local_payload, c.incoming_payload, c.status, c.created_at, c.resolved_at, u.full_name AS resolved_by_name,
                i.source_node_id
         FROM sync.conflicts c JOIN sync.inbox_events i ON i.event_id = c.event_id
         LEFT JOIN iam.users u ON u.id = c.resolved_by
         WHERE c.status = $1 OR $1 = 'all' ORDER BY c.created_at DESC LIMIT 200`,
        [status],
      ),
    );
  }

  /** Konfliktni inson hal qiladi; natija yangi versiya sifatida boshqa tugunlarga tarqaladi. */
  resolve(p: AuthPrincipal, id: string, resolution: 'local' | 'incoming', note: string) {
    return this.db.system(async (tx) => {
      const c = await one<{ resource_type: string; resource_id: string; incoming_payload: Record<string, unknown>; status: string }>(
        tx,
        'SELECT resource_type, resource_id, incoming_payload, status FROM sync.conflicts WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!c) throw new NotFoundException();
      if (c.status !== 'open') throw new BadRequestException('Conflict is already resolved');
      const spec = RESOURCES[c.resource_type];
      const cur = await one<{ version: number; data: Record<string, unknown> }>(
        tx,
        `SELECT version, to_jsonb(t) AS data FROM ${spec.table} t WHERE id = $1`,
        [c.resource_id],
      );
      if (!cur) throw new NotFoundException('Local record not found');
      const next = cur.version + 1;

      if (resolution === 'incoming') {
        const row: Record<string, unknown> = {};
        for (const col of spec.columns) if (col in c.incoming_payload) row[col] = c.incoming_payload[col];
        if (row.content !== undefined && typeof row.content !== 'string') row.content = JSON.stringify(row.content);
        row.id = c.resource_id;
        row.version = next;
        await upsert(tx, spec, row);
      } else {
        await tx.query(`UPDATE ${spec.table} SET version = $2 WHERE id = $1`, [c.resource_id, next]);
      }
      const after = await one<{ data: Record<string, unknown>; path: string | null }>(
        tx,
        `SELECT to_jsonb(t) AS data,
                COALESCE((SELECT u.path::text FROM organization.organizations o JOIN organization.administrative_units u
                            ON u.id = o.administrative_unit_id WHERE o.id = (to_jsonb(t)->>'organization_id')::uuid),
                         to_jsonb(t)->>'path') AS path
         FROM ${spec.table} t WHERE id = $1`,
        [c.resource_id],
      );
      await tx.query(
        `INSERT INTO sync.sync_events (source_node_id, resource_type, resource_id, operation, base_version, new_version, payload, admin_unit_path)
         VALUES ($1, $2, $3, 'update', $4, $5, $6, $7::ltree)`,
        [this.config.nodeId, c.resource_type, c.resource_id, cur.version, next,
          JSON.stringify({ ...after!.data, __source_level: this.config.nodeLevel, __conflict_resolution: resolution }), after!.path],
      );
      await tx.query(
        `UPDATE sync.conflicts SET status = $2, resolved_by = $3, resolved_at = now(), resolution_note = $4 WHERE id = $1`,
        [id, resolution === 'local' ? 'resolved_local' : 'resolved_incoming', p.actorId, note],
      );
      await this.audit.record(tx, p, {
        action: 'sync.conflict_resolved', resourceType: c.resource_type, resourceId: c.resource_id, data: { conflict_id: id, resolution, note },
      });
      return { resolved: true, version: next };
    });
  }
}

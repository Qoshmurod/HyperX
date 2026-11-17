import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { Tx } from '../db/db.service';

export interface DomainEvent {
  /** Webhook hodisa turi, masalan `task.created`. */
  type: string;
  /** Webhook va hudud aniqlash uchun. Hudud hodisalarida bo'lmaydi. */
  organizationId?: string;
  /** Tashkilotga bog'lanmagan resurslar (hududlar) uchun hudud yo'li. */
  adminUnitPath?: string;
  resourceType: string;
  resourceId: string;
  operation: 'insert' | 'update' | 'delete';
  baseVersion: number | null;
  newVersion: number;
  payload: Record<string, unknown>;
}

/** Sinxronlanadigan resurslar (Outbox'ga tushadi). */
export const SYNCABLE = new Set([
  'organization.administrative_units',
  'organization.organizations',
  'core.tasks',
  'analytics.kpi_definitions',
  'analytics.kpi_measurements',
  'core.reports',
]);

@Injectable()
export class EventsService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Outbox va webhook navbatiga biznes o'zgarishi bilan bitta tranzaksiyada yozadi. */
  async emit(tx: Tx, e: DomainEvent): Promise<void> {
    if (SYNCABLE.has(e.resourceType)) {
      const payload = { ...e.payload, __source_level: this.config.nodeLevel };
      if (e.adminUnitPath) {
        await tx.query(
          `INSERT INTO sync.sync_events (source_node_id, resource_type, resource_id, operation, base_version, new_version, payload, admin_unit_path)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::ltree)`,
          [this.config.nodeId, e.resourceType, e.resourceId, e.operation, e.baseVersion, e.newVersion, JSON.stringify(payload), e.adminUnitPath],
        );
      } else {
        await tx.query(
          `INSERT INTO sync.sync_events (source_node_id, resource_type, resource_id, operation, base_version, new_version, payload, admin_unit_path)
           SELECT $1::text, $2::text, $3::uuid, $4::text, $5::int, $6::int, $7::jsonb, u.path
           FROM organization.organizations o JOIN organization.administrative_units u ON u.id = o.administrative_unit_id
           WHERE o.id = $8`,
          [this.config.nodeId, e.resourceType, e.resourceId, e.operation, e.baseVersion, e.newVersion, JSON.stringify(payload), e.organizationId],
        );
      }
    }
    if (!e.organizationId) return;
    await tx.query(
      `INSERT INTO integration.webhook_deliveries (webhook_id, event_type, payload)
       SELECT w.id, $1::text, $2::jsonb FROM integration.webhooks w
       WHERE w.enabled AND w.organization_id = $3::uuid AND ($1::text = ANY (w.events) OR '*' = ANY (w.events))`,
      [e.type, JSON.stringify({ type: e.type, resourceId: e.resourceId, data: e.payload, occurredAt: new Date().toISOString() }), e.organizationId],
    );
  }
}

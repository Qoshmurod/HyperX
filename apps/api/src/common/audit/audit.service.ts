import { Injectable } from '@nestjs/common';
import { AuthPrincipal } from '../auth/principal';
import { Tx } from '../db/db.service';

export interface AuditEntry {
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  organizationId?: string | null;
  data?: Record<string, unknown>;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  /** Audit yozuvi biznes o'zgarishi bilan bitta tranzaksiyada yoziladi. */
  async record(tx: Tx, principal: AuthPrincipal | null, entry: AuditEntry): Promise<void> {
    const data: Record<string, unknown> = { ...(entry.data ?? {}) };
    if (principal && principal.kind !== 'user') data.principal = { kind: principal.kind, id: principal.id };
    await tx.query(
      `INSERT INTO audit.audit_events (organization_id, actor_id, action, resource_type, resource_id, event_data, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.organizationId ?? null,
        principal?.actorId ?? null,
        entry.action,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        JSON.stringify(data),
        entry.ip ?? null,
      ],
    );
  }
}

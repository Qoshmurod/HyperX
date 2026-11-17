import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthPrincipal } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows } from '../../common/db/db.service';
import { uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';

const auditQuery = z.object({
  action: z.string().max(100).optional(),
  actor_id: uuid.optional(),
  resource_id: uuid.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before_seq: z.coerce.number().int().optional(),
});

/** Audit jurnali faqat alohida auditor DB roli orqali o'qiladi (ilova roli o'qiy olmaydi). */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly db: DbService) {}

  @Get()
  @RequirePermission('audit.read')
  list(@CurrentPrincipal() p: AuthPrincipal, @Query(new ZodPipe(auditQuery)) q: z.infer<typeof auditQuery>) {
    return this.db.auditor(p, (tx) =>
      rows(
        tx,
        `SELECT a.seq, a.id, a.organization_id, a.actor_id, u.full_name AS actor_name, a.action, a.resource_type, a.resource_id,
                a.event_data, a.ip_address::text AS ip_address, a.occurred_at
         FROM audit.audit_events a LEFT JOIN iam.users u ON u.id = a.actor_id
         WHERE ($1::text IS NULL OR a.action LIKE $1 || '%')
           AND ($2::uuid IS NULL OR a.actor_id = $2)
           AND ($3::uuid IS NULL OR a.resource_id = $3)
           AND ($4::timestamptz IS NULL OR a.occurred_at >= $4)
           AND ($5::timestamptz IS NULL OR a.occurred_at < $5)
           AND ($6::bigint IS NULL OR a.seq < $6)
         ORDER BY a.seq DESC LIMIT $7`,
        [q.action ?? null, q.actor_id ?? null, q.resource_id ?? null, q.from ?? null, q.to ?? null, q.before_seq ?? null, q.limit],
      ),
    );
  }

  @Get('verify')
  @RequirePermission('audit.read')
  verify(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.auditor(p, async (tx) => {
      const r = await one<{ broken: string | null; total: number }>(
        tx,
        'SELECT audit.verify_chain() AS broken, (SELECT count(*)::int FROM audit.audit_events) AS total',
      );
      return { intact: r!.broken === null, first_broken_seq: r!.broken, checked_at: new Date().toISOString() };
    });
  }
}

import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal } from '../../common/auth/principal';
import { AllowApiClient, CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows, Tx } from '../../common/db/db.service';
import { EventsService } from '../../common/events/events.service';
import { isoDate, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';

const defCreate = z.object({
  organization_id: uuid,
  code: z.string().regex(/^[a-z0-9_]{2,100}$/),
  name: z.string().min(2).max(255),
  unit: z.string().max(50).optional(),
  direction: z.enum(['higher', 'lower']),
  period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
});

export const measurementInput = z.object({
  period_start: isoDate,
  planned_value: z.number().finite().nullable().optional(),
  actual_value: z.number().finite().nullable().optional(),
  source: z.string().min(2).max(255),
});

@ApiTags('kpi')
@ApiBearerAuth()
@Controller('kpi')
export class KpiController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  @Get('definitions')
  @RequirePermission('kpi.read')
  list(@CurrentPrincipal() p: AuthPrincipal, @Query('organization_id') orgId?: string) {
    return this.db.scoped(p, 'kpi.read', (tx) =>
      rows(
        tx,
        `SELECT d.*, o.name AS organization_name,
                m.period_start AS last_period, m.planned_value AS last_planned, m.actual_value AS last_actual,
                CASE WHEN m.planned_value IS NULL OR m.planned_value = 0 OR m.actual_value IS NULL THEN NULL
                     ELSE round(100 * m.actual_value / m.planned_value, 1) END AS last_attainment_pct
         FROM analytics.kpi_definitions d JOIN organization.organizations o ON o.id = d.organization_id
         LEFT JOIN LATERAL (SELECT * FROM analytics.kpi_measurements k WHERE k.kpi_definition_id = d.id
                            ORDER BY period_start DESC LIMIT 1) m ON true
         WHERE ($1::uuid IS NULL OR d.organization_id = $1)
         ORDER BY o.name, d.name`,
        [orgId || null],
      ),
    );
  }

  @Post('definitions')
  @RequirePermission('kpi.manage')
  create(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(defCreate)) body: z.infer<typeof defCreate>) {
    return this.db.scoped(p, 'kpi.manage', async (tx) => {
      await assertCanAtOrg(tx, p, 'kpi.manage', body.organization_id);
      const def = await one<{ id: string }>(
        tx,
        `INSERT INTO analytics.kpi_definitions (organization_id, code, name, unit, direction, period)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [body.organization_id, body.code, body.name, body.unit ?? null, body.direction, body.period],
      );
      await this.events.emit(tx, {
        type: 'kpi.definition_created', organizationId: body.organization_id, resourceType: 'analytics.kpi_definitions',
        resourceId: def!.id, operation: 'insert', baseVersion: null, newVersion: 1, payload: def!,
      });
      await this.audit.record(tx, p, {
        action: 'kpi.definition_created', resourceType: 'analytics.kpi_definitions', resourceId: def!.id, organizationId: body.organization_id,
      });
      return def;
    });
  }

  @Get('definitions/:id')
  @RequirePermission('kpi.read')
  get(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'kpi.read', async (tx) => {
      const def = await one(
        tx,
        `SELECT d.*, o.name AS organization_name FROM analytics.kpi_definitions d
         JOIN organization.organizations o ON o.id = d.organization_id WHERE d.id = $1`,
        [id],
      );
      if (!def) throw new NotFoundException();
      const measurements = await rows(
        tx,
        `SELECT id, period_start, planned_value, actual_value, source, recorded_at
         FROM analytics.kpi_measurements WHERE kpi_definition_id = $1 ORDER BY period_start`,
        [id],
      );
      const forecasts = await rows(
        tx,
        `SELECT id, method, horizon, points, metrics, scenario, created_at FROM analytics.forecasts
         WHERE kpi_definition_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [id],
      );
      return { ...def, measurements, forecasts };
    });
  }

  @Post('definitions/:id/measurements')
  @AllowApiClient()
  @RequirePermission('kpi.manage')
  record(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(measurementInput)) body: z.infer<typeof measurementInput>,
  ) {
    return this.db.scoped(p, 'kpi.manage', (tx) => recordMeasurement(tx, p, id, body, this.audit, this.events));
  }
}

export async function recordMeasurement(
  tx: Tx,
  p: AuthPrincipal,
  definitionId: string,
  body: z.infer<typeof measurementInput>,
  audit: AuditService,
  events: EventsService,
) {
  const def = await one<{ organization_id: string }>(tx, 'SELECT organization_id FROM analytics.kpi_definitions WHERE id = $1', [definitionId]);
  if (!def) throw new NotFoundException('KPI not found');
  await assertCanAtOrg(tx, p, 'kpi.manage', def.organization_id);
  const prev = await one<{ id: string }>(
    tx,
    'SELECT id FROM analytics.kpi_measurements WHERE kpi_definition_id = $1 AND period_start = $2',
    [definitionId, body.period_start],
  );
  const m = await one<{ id: string }>(
    tx,
    `INSERT INTO analytics.kpi_measurements (kpi_definition_id, organization_id, period_start, planned_value, actual_value, source, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (kpi_definition_id, period_start) DO UPDATE SET
       planned_value = COALESCE(EXCLUDED.planned_value, analytics.kpi_measurements.planned_value),
       actual_value = COALESCE(EXCLUDED.actual_value, analytics.kpi_measurements.actual_value),
       source = EXCLUDED.source, recorded_by = EXCLUDED.recorded_by, recorded_at = now()
     RETURNING *`,
    [definitionId, def.organization_id, body.period_start, body.planned_value ?? null, body.actual_value ?? null, body.source, p.actorId],
  );
  await events.emit(tx, {
    type: 'kpi.measurement_recorded', organizationId: def.organization_id, resourceType: 'analytics.kpi_measurements',
    resourceId: m!.id, operation: prev ? 'update' : 'insert', baseVersion: null, newVersion: 1, payload: m!,
  });
  await audit.record(tx, p, {
    action: 'kpi.measurement_recorded', resourceType: 'analytics.kpi_measurements', resourceId: m!.id,
    organizationId: def.organization_id, data: body,
  });
  return m!;
}

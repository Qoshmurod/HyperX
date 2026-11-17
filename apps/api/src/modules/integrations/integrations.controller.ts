import {
  BadRequestException, Body, Controller, ForbiddenException, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';

import { AuthPrincipal, canAt, hasPermission } from '../../common/auth/principal';
import { AllowApiClient, CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { CryptoService, randomToken, sha256 } from '../../common/crypto/crypto.service';
import { DbService, one, rows } from '../../common/db/db.service';
import { EventsService } from '../../common/events/events.service';
import { classification, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';
import { measurementInput, recordMeasurement } from '../kpi/kpi.controller';
import { createTask, taskCreate } from '../tasks/tasks.controller';
import { detectFormat, Format, MIME, parseRows, writeRows } from './tabular';
import { assertWebhookUrl } from './webhook-security';

const WEBHOOK_EVENTS = [
  '*', 'task.created', 'task.updated', 'task.status_changed', 'kpi.measurement_recorded', 'report.review', 'report.approved',
  'decision.approved', 'decision.rejected', 'organization.created', 'organization.updated',
] as const;

const clientBody = z.object({
  organization_id: uuid,
  name: z.string().min(2).max(255),
  permissions: z.array(z.enum(['tasks.read', 'tasks.manage', 'kpi.read', 'kpi.manage'])).min(1),
  max_classification: classification.default('internal'),
});

const webhookBody = z.object({
  organization_id: uuid,
  url: z.string().url().max(1024),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

const TASK_EXPORT_COLUMNS = ['id', 'organization', 'title', 'description', 'priority', 'status', 'classification', 'deadline', 'completed_at', 'created_at'];

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  // ---------------- API mijozlar ----------------

  @Get('clients')
  @RequirePermission('integrations.manage')
  clients(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'integrations.manage', (tx) =>
      rows(
        tx,
        `SELECT c.id, c.name, c.key_prefix, c.permissions, c.max_classification, c.status, c.last_used_at, c.created_at,
                o.name AS organization_name
         FROM integration.api_clients c JOIN organization.organizations o ON o.id = c.organization_id
         WHERE app.org_visible(c.organization_id) ORDER BY c.created_at DESC`,
      ),
    );
  }

  @Post('clients')
  @RequirePermission('integrations.manage')
  createClient(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(clientBody)) body: z.infer<typeof clientBody>) {
    return this.db.scoped(p, 'integrations.manage', async (tx) => {
      const path = await assertCanAtOrg(tx, p, 'integrations.manage', body.organization_id, body.max_classification);
      // Mijozga o'zingizda shu hududda bo'lmagan ruxsat berib bo'lmaydi.
      for (const perm of body.permissions) {
        if (!canAt(p, perm, path, body.max_classification)) throw new BadRequestException(`You do not hold ${perm} at this level`);
      }
      const key = randomToken('gm');
      const client = await one(
        tx,
        `INSERT INTO integration.api_clients (organization_id, name, key_prefix, key_hash, permissions, max_classification, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, key_prefix, permissions, max_classification, status, created_at`,
        [body.organization_id, body.name, key.slice(0, 10), sha256(key), body.permissions, body.max_classification, p.actorId],
      );
      await this.audit.record(tx, p, {
        action: 'integration.client_created', resourceType: 'integration.api_clients', resourceId: (client as any).id,
        organizationId: body.organization_id, data: { name: body.name, permissions: body.permissions },
      });
      return { ...client, api_key: key };
    });
  }

  @Delete('clients/:id')
  @RequirePermission('integrations.manage')
  revokeClient(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'integrations.manage', async (tx) => {
      const c = await one<{ organization_id: string }>(
        tx,
        `UPDATE integration.api_clients SET status = 'revoked' WHERE id = $1 AND app.org_visible(organization_id) RETURNING organization_id`,
        [id],
      );
      if (!c) throw new NotFoundException();
      await assertCanAtOrg(tx, p, 'integrations.manage', c.organization_id);
      await this.audit.record(tx, p, { action: 'integration.client_revoked', resourceType: 'integration.api_clients', resourceId: id, organizationId: c.organization_id });
      return { revoked: true };
    });
  }

  // ---------------- Webhooklar ----------------

  @Get('webhooks')
  @RequirePermission('integrations.manage')
  webhooks(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'integrations.manage', (tx) =>
      rows(
        tx,
        `SELECT w.id, w.url, w.events, w.enabled, w.created_at, o.name AS organization_name,
                (SELECT count(*)::int FROM integration.webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed,
                (SELECT count(*)::int FROM integration.webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'pending') AS pending
         FROM integration.webhooks w JOIN organization.organizations o ON o.id = w.organization_id
         WHERE app.org_visible(w.organization_id) ORDER BY w.created_at DESC`,
      ),
    );
  }

  @Post('webhooks')
  @RequirePermission('integrations.manage')
  createWebhook(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(webhookBody)) body: z.infer<typeof webhookBody>) {
    try {
      assertWebhookUrl(body.url);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    return this.db.scoped(p, 'integrations.manage', async (tx) => {
      await assertCanAtOrg(tx, p, 'integrations.manage', body.organization_id);
      const secret = randomBytes(32).toString('base64url');
      const w = await one(
        tx,
        `INSERT INTO integration.webhooks (organization_id, url, events, secret_enc, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, url, events, enabled, created_at`,
        [body.organization_id, body.url, body.events, this.crypto.encryptString(secret), p.actorId],
      );
      await this.audit.record(tx, p, {
        action: 'integration.webhook_created', resourceType: 'integration.webhooks', resourceId: (w as any).id,
        organizationId: body.organization_id, data: { url: body.url, events: body.events },
      });
      return { ...w, signing_secret: secret };
    });
  }

  @Delete('webhooks/:id')
  @RequirePermission('integrations.manage')
  deleteWebhook(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'integrations.manage', async (tx) => {
      const w = await one<{ organization_id: string }>(
        tx,
        'UPDATE integration.webhooks SET enabled = false WHERE id = $1 AND app.org_visible(organization_id) RETURNING organization_id',
        [id],
      );
      if (!w) throw new NotFoundException();
      await assertCanAtOrg(tx, p, 'integrations.manage', w.organization_id);
      await this.audit.record(tx, p, { action: 'integration.webhook_disabled', resourceType: 'integration.webhooks', resourceId: id, organizationId: w.organization_id });
      return { disabled: true };
    });
  }

  @Get('webhooks/:id/deliveries')
  @RequirePermission('integrations.manage')
  deliveries(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'integrations.manage', (tx) =>
      rows(
        tx,
        `SELECT d.id, d.event_id, d.event_type, d.status, d.attempts, d.response_status, d.last_error, d.created_at, d.delivered_at
         FROM integration.webhook_deliveries d JOIN integration.webhooks w ON w.id = d.webhook_id
         WHERE d.webhook_id = $1 AND app.org_visible(w.organization_id) ORDER BY d.created_at DESC LIMIT 200`,
        [id],
      ),
    );
  }

  /** Integratsiya xatolarini monitoring qilish: so'nggi 24 soat. */
  @Get('health')
  @RequirePermission('integrations.manage')
  health(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'integrations.manage', async (tx) => ({
      webhooks: await one(
        tx,
        `SELECT count(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
                count(*) FILTER (WHERE d.status = 'failed')::int AS failed,
                count(*) FILTER (WHERE d.status = 'pending' AND d.attempts > 0)::int AS retrying
         FROM integration.webhook_deliveries d JOIN integration.webhooks w ON w.id = d.webhook_id
         WHERE d.created_at > now() - interval '24 hours' AND app.org_visible(w.organization_id)`,
      ),
      imports: await rows(
        tx,
        `SELECT id, kind, format, status, total, succeeded, failed, created_at FROM integration.import_jobs
         WHERE app.org_visible(organization_id) ORDER BY created_at DESC LIMIT 20`,
      ),
      recent_errors: await rows(
        tx,
        `SELECT w.url, d.event_type, d.last_error, d.response_status, d.created_at
         FROM integration.webhook_deliveries d JOIN integration.webhooks w ON w.id = d.webhook_id
         WHERE d.last_error IS NOT NULL AND d.created_at > now() - interval '24 hours' AND app.org_visible(w.organization_id)
         ORDER BY d.created_at DESC LIMIT 20`,
      ),
    }));
  }

  // ---------------- Import / Export ----------------

  @Post('import/:kind')
  @AllowApiClient()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async import(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('kind') kind: string,
    @Query('organization_id', ParseUUIDPipe) orgId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (kind !== 'tasks' && kind !== 'kpi_measurements') throw new BadRequestException('kind must be tasks or kpi_measurements');
    if (!file) throw new BadRequestException('file is required');
    const format = detectFormat(file.originalname, file.mimetype);
    if (!format) throw new BadRequestException('Unsupported format (csv, xlsx, json)');
    let data: Record<string, unknown>[];
    try {
      data = await parseRows(file.buffer, format);
    } catch (e) {
      throw new BadRequestException(`Cannot parse file: ${(e as Error).message}`);
    }
    const perm = kind === 'tasks' ? 'tasks.manage' : 'kpi.manage';
    if (!hasPermission(p, perm)) throw new ForbiddenException();

    return this.db.scoped(p, perm, async (tx) => {
      await assertCanAtOrg(tx, p, perm, orgId);
      const errors: { row: number; message: string }[] = [];
      let ok = 0;
      for (let i = 0; i < data.length; i++) {
        const raw = data[i];
        // Har bir qator alohida savepoint: xato qator butun importni buzmaydi.
        await tx.query('SAVEPOINT row_import');
        try {
          if (kind === 'tasks') {
            const assignee = raw.assignee_username
              ? await one<{ id: string }>(tx, 'SELECT id FROM iam.users WHERE username = $1', [String(raw.assignee_username)])
              : undefined;
            const input = taskCreate.parse({
              organization_id: orgId,
              title: raw.title,
              description: raw.description || undefined,
              priority: raw.priority || undefined,
              classification: raw.classification || undefined,
              deadline: raw.deadline ? normalizeDate(String(raw.deadline)) : undefined,
              assignee_ids: assignee ? [assignee.id] : [],
            });
            await createTask(tx, p, input, this.audit, this.events);
          } else {
            const def = await one<{ id: string }>(
              tx,
              'SELECT id FROM analytics.kpi_definitions WHERE organization_id = $1 AND code = $2',
              [orgId, String(raw.kpi_code ?? '')],
            );
            if (!def) throw new Error(`Unknown kpi_code ${raw.kpi_code}`);
            const input = measurementInput.parse({
              period_start: String(raw.period_start ?? '').slice(0, 10),
              planned_value: raw.planned_value === '' || raw.planned_value == null ? null : Number(raw.planned_value),
              actual_value: raw.actual_value === '' || raw.actual_value == null ? null : Number(raw.actual_value),
              source: String(raw.source || `import:${file.originalname}`),
            });
            await recordMeasurement(tx, p, def.id, input, this.audit, this.events);
          }
          await tx.query('RELEASE SAVEPOINT row_import');
          ok++;
        } catch (e) {
          await tx.query('ROLLBACK TO SAVEPOINT row_import');
          const msg = e instanceof z.ZodError ? e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') : (e as Error).message;
          errors.push({ row: i + 2, message: msg.slice(0, 300) });
        }
      }
      const status = errors.length === 0 ? 'completed' : ok === 0 ? 'failed' : 'partial';
      const job = await one(
        tx,
        `INSERT INTO integration.import_jobs (organization_id, kind, format, status, total, succeeded, failed, errors, created_by, api_client_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, status, total, succeeded, failed, errors`,
        [orgId, kind, format, status, data.length, ok, errors.length, JSON.stringify(errors.slice(0, 500)), p.actorId,
          p.kind === 'api_client' ? p.id : null],
      );
      await this.audit.record(tx, p, {
        action: 'integration.import', resourceType: 'integration.import_jobs', resourceId: (job as any).id, organizationId: orgId,
        data: { kind, format, total: data.length, succeeded: ok, failed: errors.length },
      });
      return job;
    });
  }

  @Get('export/tasks')
  @AllowApiClient()
  @RequirePermission('tasks.read')
  async exportTasks(
    @CurrentPrincipal() p: AuthPrincipal,
    @Query('format') formatParam: string,
    @Query('organization_id') orgId: string | undefined,
    @Res() res: Response,
  ) {
    const format = (['csv', 'xlsx', 'json'].includes(formatParam) ? formatParam : 'csv') as Format;
    const data = await this.db.scoped(p, 'tasks.read', async (tx) => {
      const r = await rows(
        tx,
        `SELECT t.id, o.name AS organization, t.title, t.description, t.priority, t.status, t.classification,
                t.deadline, t.completed_at, t.created_at
         FROM core.tasks t JOIN organization.organizations o ON o.id = t.organization_id
         WHERE ($1::uuid IS NULL OR t.organization_id = $1) ORDER BY t.created_at DESC LIMIT 50000`,
        [orgId || null],
      );
      await this.audit.record(tx, p, { action: 'integration.export', resourceType: 'core.tasks', data: { format, rows: r.length, organization_id: orgId } });
      return r;
    });
    res.setHeader('Content-Type', MIME[format]);
    res.setHeader('Content-Disposition', `attachment; filename="govmind-tasks.${format}"`);
    res.send(await writeRows(data, TASK_EXPORT_COLUMNS, format));
  }
}

function normalizeDate(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T18:00:00+05:00`;
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T18:00:00+05:00`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date ${v}`);
  return d.toISOString();
}


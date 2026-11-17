import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AiEngineClient, Lang } from '../../common/ai/ai-engine.client';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal, hasPermission } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows } from '../../common/db/db.service';
import { EventsService } from '../../common/events/events.service';
import { VersionConflict } from '../../common/http/errors';
import { RequestLang } from '../../common/http/lang';
import { classification, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';
import { AnalyticsService, CATALOG_CODES, runCatalogQuery } from '../analytics/analytics.service';
import { recordAiRun } from '../ai/ai-runs';

const draftBody = z.object({
  organization_id: uuid,
  title: z.string().min(3).max(500),
  problem: z.string().min(10).max(10_000),
  classification: classification.default('internal'),
  evidence_queries: z.array(z.enum(CATALOG_CODES)).max(5).default(['tasks.late_by_org', 'kpi.behind_plan']),
});

const reviewBody = z.object({
  selected_option: z.number().int().min(0).optional(),
  note: z.string().min(3).max(5000),
  version: z.number().int(),
});

@ApiTags('decisions')
@ApiBearerAuth()
@Controller('decisions')
export class DecisionsController {
  constructor(
    private readonly db: DbService,
    private readonly ai: AiEngineClient,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  @Get()
  @RequirePermission('decisions.create')
  list(@CurrentPrincipal() p: AuthPrincipal, @Query('status') status?: string) {
    return this.db.scoped(p, 'decisions.create', (tx) =>
      rows(
        tx,
        `SELECT d.id, d.title, d.status, d.organization_id, o.name AS organization_name, d.classification,
                d.created_at, cu.full_name AS created_by_name, d.version
         FROM core.decision_drafts d JOIN organization.organizations o ON o.id = d.organization_id
         JOIN iam.users cu ON cu.id = d.created_by
         WHERE ($1::text IS NULL OR d.status = $1) ORDER BY d.created_at DESC LIMIT 200`,
        [status || null],
      ),
    );
  }

  @Get(':id')
  @RequirePermission('decisions.create')
  get(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'decisions.create', async (tx) => {
      const d = await one(
        tx,
        `SELECT d.*, o.name AS organization_name, cu.full_name AS created_by_name, ru.full_name AS reviewed_by_name,
                r.model_name, r.model_version, r.runtime
         FROM core.decision_drafts d JOIN organization.organizations o ON o.id = d.organization_id
         JOIN iam.users cu ON cu.id = d.created_by LEFT JOIN iam.users ru ON ru.id = d.reviewed_by
         LEFT JOIN ai.ai_runs r ON r.id = d.ai_run_id WHERE d.id = $1`,
        [id],
      );
      if (!d) throw new NotFoundException();
      return d;
    });
  }

  /** AI muammo tahlili va variantlarni tayyorlaydi — bu faqat loyiha, qaror emas. */
  @Post()
  @RequirePermission('decisions.create')
  create(@CurrentPrincipal() p: AuthPrincipal, @RequestLang() lang: Lang, @Body(new ZodPipe(draftBody)) body: z.infer<typeof draftBody>) {
    return this.db.scoped(p, 'decisions.create', async (tx) => {
      await assertCanAtOrg(tx, p, 'decisions.create', body.organization_id, body.classification);
      const evidence: { query_code: string; rows: unknown[] }[] = [];
      for (const code of body.evidence_queries) {
        const domainPerm = code.startsWith('kpi') ? 'kpi.read' : code.startsWith('reports') ? 'reports.read' : 'tasks.read';
        if (!hasPermission(p, domainPerm)) continue;
        const data = await this.db.scoped(p, domainPerm, async (t2) => (await runCatalogQuery(this.analytics, t2, code, {})) ?? []);
        evidence.push({ query_code: code, rows: (data as unknown[]) ?? [] });
      }
      const draft = await this.ai.draftDecision({ problem: body.problem, evidence, classification: body.classification, lang });
      const runId = await recordAiRun(tx, p, {
        organizationId: body.organization_id,
        taskType: 'decision_draft',
        input: { problem: body.problem, evidence: evidence.map((e) => e.query_code) },
        meta: draft,
        result: { causes: draft.causes, options: draft.options },
        confidence: draft.confidence,
        sources: evidence.map((e) => ({ source_type: 'query' as const, query_code: e.query_code, excerpt: `${e.rows.length} rows` })),
      });
      const d = await one<{ id: string }>(
        tx,
        `INSERT INTO core.decision_drafts (organization_id, title, problem, analysis, options, classification, ai_run_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          body.organization_id, body.title, body.problem,
          JSON.stringify({ causes: draft.causes, evidence: evidence.map((e) => ({ query_code: e.query_code, rows: e.rows.slice(0, 50) })) }),
          JSON.stringify(draft.options), body.classification, runId, p.actorId,
        ],
      );
      await this.audit.record(tx, p, {
        action: 'decision.drafted', resourceType: 'core.decision_drafts', resourceId: d!.id, organizationId: body.organization_id,
        data: { ai_run_id: runId },
      });
      return d;
    });
  }

  @Post(':id/submit')
  @RequirePermission('decisions.create')
  submit(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ version: z.number().int() }))) body: { version: number }) {
    return this.db.scoped(p, 'decisions.create', async (tx) => {
      const d = await one<{ organization_id: string }>(
        tx,
        `UPDATE core.decision_drafts SET status = 'under_review' WHERE id = $1 AND version = $2 AND status = 'draft' RETURNING *`,
        [id, body.version],
      );
      if (!d) throw new VersionConflict();
      await this.audit.record(tx, p, { action: 'decision.submitted', resourceType: 'core.decision_drafts', resourceId: id, organizationId: d.organization_id });
      return d;
    });
  }

  @Post(':id/approve')
  @RequirePermission('decisions.approve')
  approve(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reviewBody)) body: z.infer<typeof reviewBody>) {
    return this.review(p, id, 'approved', body);
  }

  @Post(':id/reject')
  @RequirePermission('decisions.approve')
  reject(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reviewBody)) body: z.infer<typeof reviewBody>) {
    return this.review(p, id, 'rejected', body);
  }

  private review(p: AuthPrincipal, id: string, status: 'approved' | 'rejected', body: z.infer<typeof reviewBody>) {
    return this.db.scoped(p, 'decisions.approve', async (tx) => {
      const current = await one<{ organization_id: string; created_by: string; options: unknown[]; classification: any; status: string }>(
        tx,
        'SELECT organization_id, created_by, options, classification, status FROM core.decision_drafts WHERE id = $1',
        [id],
      );
      if (!current) throw new NotFoundException();
      await assertCanAtOrg(tx, p, 'decisions.approve', current.organization_id, current.classification);
      // To'rt ko'z tamoyili: loyihani tayyorlagan shaxs uni o'zi tasdiqlay olmaydi.
      if (current.created_by === p.actorId) throw new ForbiddenException('The author cannot review their own decision draft');
      if (current.status !== 'under_review') throw new BadRequestException('Draft must be submitted for review first');
      if (status === 'approved') {
        if (body.selected_option === undefined || body.selected_option >= current.options.length) {
          throw new BadRequestException('A valid selected_option is required to approve');
        }
      }
      const d = await one<{ id: string }>(
        tx,
        `UPDATE core.decision_drafts SET status = $2::text, selected_option = $3::int, review_note = $4, reviewed_by = $5, reviewed_at = now()
         WHERE id = $1 AND version = $6 RETURNING *`,
        [id, status, status === 'approved' ? body.selected_option : null, body.note, p.actorId, body.version],
      );
      if (!d) throw new VersionConflict();
      await this.events.emit(tx, {
        type: `decision.${status}`, organizationId: current.organization_id, resourceType: 'core.decision_drafts', resourceId: id,
        operation: 'update', baseVersion: body.version, newVersion: body.version + 1, payload: { id, status, selected_option: body.selected_option },
      });
      await tx.query(
        `INSERT INTO core.notifications (user_id, organization_id, kind, severity, title, link, dedupe_key)
         VALUES ($1, $2, 'decision', 'info', $3, $4, $5) ON CONFLICT (dedupe_key) DO NOTHING`,
        [current.created_by, current.organization_id, status === 'approved' ? 'Qaror loyihasi tasdiqlandi' : 'Qaror loyihasi rad etildi',
          `/decisions/${id}`, `decision:${id}:${status}`],
      );
      await this.audit.record(tx, p, {
        action: `decision.${status}`, resourceType: 'core.decision_drafts', resourceId: id, organizationId: current.organization_id,
        data: { selected_option: body.selected_option, note: body.note },
      });
      return d;
    });
  }
}

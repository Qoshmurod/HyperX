import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { isLocale, Locale } from '@govmind/i18n';
import { Response } from 'express';
import { z } from 'zod';
import { AiEngineClient, Lang } from '../../common/ai/ai-engine.client';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows } from '../../common/db/db.service';
import { EventsService } from '../../common/events/events.service';
import { VersionConflict } from '../../common/http/errors';
import { RequestLang } from '../../common/http/lang';
import { classification, isoDate, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';
import { AnalyticsService } from '../analytics/analytics.service';
import { recordAiRun } from '../ai/ai-runs';
import { EXPORT_FORMATS, ReportContent } from './report-renderer';

const REPORT_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'custom'] as const;

const generateBody = z.object({
  organization_id: uuid,
  report_type: z.enum(REPORT_TYPES),
  period_start: isoDate.optional(),
  period_end: isoDate.optional(),
  with_ai_commentary: z.boolean().default(true),
  classification: classification.default('internal'),
});

/** Hisobot turi bo'yicha standart davr (oxirgi tugagan kun/hafta/oy/chorak). */
export function defaultReportPeriod(type: (typeof REPORT_TYPES)[number], now = new Date()): { from: string; to: string } {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (type) {
    case 'daily': {
      const y = new Date(day.getTime() - 86_400_000);
      return { from: d(y), to: d(y) };
    }
    case 'weekly': {
      const dow = (day.getUTCDay() + 6) % 7; // dushanba = 0
      const end = new Date(day.getTime() - (dow + 1) * 86_400_000);
      return { from: d(new Date(end.getTime() - 6 * 86_400_000)), to: d(end) };
    }
    case 'monthly': {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { from: d(from), to: d(to) };
    }
    case 'quarterly':
    default: {
      const q = Math.floor(now.getUTCMonth() / 3) - 1;
      const year = now.getUTCFullYear() + Math.floor(q / 4);
      const qi = ((q % 4) + 4) % 4;
      return { from: d(new Date(Date.UTC(year, qi * 3, 1))), to: d(new Date(Date.UTC(year, qi * 3 + 3, 0))) };
    }
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly db: DbService,
    private readonly analytics: AnalyticsService,
    private readonly ai: AiEngineClient,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  @Get()
  @RequirePermission('reports.read')
  list(@CurrentPrincipal() p: AuthPrincipal, @Query('organization_id') orgId?: string, @Query('report_type') type?: string) {
    return this.db.scoped(p, 'reports.read', (tx) =>
      rows(
        tx,
        `SELECT r.id, r.organization_id, o.name AS organization_name, r.report_type, r.period_start, r.period_end,
                r.status, r.classification, r.created_at, r.version, cu.full_name AS created_by_name
         FROM core.reports r JOIN organization.organizations o ON o.id = r.organization_id
         JOIN iam.users cu ON cu.id = r.created_by
         WHERE ($1::uuid IS NULL OR r.organization_id = $1) AND ($2::text IS NULL OR r.report_type = $2)
         ORDER BY r.period_end DESC, r.created_at DESC LIMIT 200`,
        [orgId || null, type || null],
      ),
    );
  }

  @Get(':id')
  @RequirePermission('reports.read')
  get(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'reports.read', async (tx) => {
      const r = await one(
        tx,
        `SELECT r.*, o.name AS organization_name, cu.full_name AS created_by_name, au.full_name AS approved_by_name
         FROM core.reports r JOIN organization.organizations o ON o.id = r.organization_id
         JOIN iam.users cu ON cu.id = r.created_by LEFT JOIN iam.users au ON au.id = r.approved_by WHERE r.id = $1`,
        [id],
      );
      if (!r) throw new NotFoundException();
      return r;
    });
  }

  @Post('generate')
  @RequirePermission('reports.read')
  async generate(@CurrentPrincipal() p: AuthPrincipal, @RequestLang() lang: Lang, @Body(new ZodPipe(generateBody)) body: z.infer<typeof generateBody>) {
    const period =
      body.period_start && body.period_end ? { from: body.period_start, to: body.period_end } : defaultReportPeriod(body.report_type);
    if (period.from > period.to) throw new BadRequestException('period_start must be before period_end');

    const { path, org } = await this.db.scoped(p, 'reports.read', async (tx) => {
      const path = await assertCanAtOrg(tx, p, 'reports.read', body.organization_id, body.classification);
      const org = await one<{ name: string }>(tx, 'SELECT name FROM organization.organizations WHERE id = $1', [body.organization_id]);
      return { path, org: org! };
    });

    // Ma'lumot foydalanuvchi vakolati va tashkilot hududining kesishmasida yig'iladi.
    const data = await this.db.scopedTo(p, 'tasks.read', path, async (tx) => ({
      summary: (await this.analytics.summary(tx, period)) as Record<string, number | null>,
      by_organization: await this.analytics.statusByOrganization(tx, period),
      late_by_organization: await this.analytics.lateByOrganization(tx, period),
      trend: await this.analytics.monthlyTrend(tx, 12),
    }));
    const kpi = await this.db.scopedTo(p, 'kpi.read', path, (tx) => this.analytics.kpiBehindPlan(tx));

    const content: ReportContent = {
      title: `${org.name}: ${body.report_type} ${period.from} — ${period.to}`,
      organization_name: org.name,
      period,
      report_type: body.report_type,
      generated_at: new Date().toISOString(),
      ...data,
      kpi_behind_plan: kpi,
      commentary: null,
    };

    let aiMeta: Awaited<ReturnType<AiEngineClient['commentary']>> | null = null;
    if (body.with_ai_commentary) {
      aiMeta = await this.ai.commentary({ report: content, classification: body.classification, lang }).catch(() => null);
      if (aiMeta) content.commentary = { text: aiMeta.text, model_name: aiMeta.model_name, model_version: aiMeta.model_version };
    }

    return this.db.scoped(p, 'reports.read', async (tx) => {
      const runId = aiMeta
        ? await recordAiRun(tx, p, {
            organizationId: body.organization_id, taskType: 'report_commentary', input: { period, type: body.report_type },
            meta: aiMeta, result: { text: aiMeta.text }, confidence: null,
            sources: ['tasks.status_by_org', 'tasks.late_by_org', 'kpi.behind_plan'].map((q) => ({ source_type: 'query' as const, query_code: q })),
          })
        : null;
      const r = await one<{ id: string; version: number }>(
        tx,
        `INSERT INTO core.reports (organization_id, report_type, period_start, period_end, content, ai_run_id, classification, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, version, period_start, period_end`,
        [body.organization_id, body.report_type, period.from, period.to, JSON.stringify(content), runId, body.classification, p.actorId],
      );
      await this.audit.record(tx, p, {
        action: 'report.generated', resourceType: 'core.reports', resourceId: r!.id, organizationId: body.organization_id,
        data: { type: body.report_type, period },
      });
      return r;
    });
  }

  @Post(':id/submit')
  @RequirePermission('reports.read')
  submit(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ version: z.number().int() }))) body: { version: number }) {
    return this.transition(p, id, 'reports.read', 'draft', 'review', body.version);
  }

  @Post(':id/approve')
  @RequirePermission('reports.approve')
  approve(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ version: z.number().int() }))) body: { version: number }) {
    return this.transition(p, id, 'reports.approve', 'review', 'approved', body.version);
  }

  private transition(p: AuthPrincipal, id: string, perm: string, from: string, to: string, version: number) {
    return this.db.scoped(p, perm, async (tx) => {
      const r = await one<{ organization_id: string; version: number; classification: any }>(
        tx,
        `UPDATE core.reports SET status = $3::text, approved_by = CASE WHEN $3::text = 'approved' THEN $4::uuid ELSE approved_by END
         WHERE id = $1 AND version = $2 AND status = $5::text RETURNING *`,
        [id, version, to, p.actorId, from],
      );
      if (!r) throw new VersionConflict();
      await assertCanAtOrg(tx, p, perm, r.organization_id, r.classification);
      await this.events.emit(tx, {
        type: `report.${to}`, organizationId: r.organization_id, resourceType: 'core.reports', resourceId: id,
        operation: 'update', baseVersion: version, newVersion: r.version, payload: { id, status: to },
      });
      await this.audit.record(tx, p, { action: `report.${to}`, resourceType: 'core.reports', resourceId: id, organizationId: r.organization_id });
      return r;
    });
  }

  @Get(':id/export')
  @RequirePermission('reports.export')
  async export(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format: string,
    @Query('lang') langParam: string | undefined,
    @RequestLang() reqLang: Lang,
    @Res() res: Response,
  ) {
    const fmt = EXPORT_FORMATS[format as keyof typeof EXPORT_FORMATS];
    if (!fmt) throw new BadRequestException('format must be pdf, xlsx or docx');
    const lang: Locale = isLocale(langParam) ? langParam : reqLang;
    const report = await this.db.scoped(p, 'reports.export', async (tx) => {
      const r = await one<{ content: ReportContent; organization_id: string; report_type: string; period_end: string }>(
        tx,
        "SELECT content, organization_id, report_type, to_char(period_end, 'YYYY-MM-DD') AS period_end FROM core.reports WHERE id = $1",
        [id],
      );
      if (!r) throw new NotFoundException();
      await this.audit.record(tx, p, {
        action: 'report.exported', resourceType: 'core.reports', resourceId: id, organizationId: r.organization_id, data: { format, lang },
      });
      return r;
    });
    const buf = await fmt.render(report.content, lang);
    res.setHeader('Content-Type', fmt.mime);
    res.setHeader('Content-Disposition', `attachment; filename="govmind-${report.report_type}-${report.period_end}.${format}"`);
    res.send(buf);
  }
}

import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AiEngineClient, Lang } from '../../common/ai/ai-engine.client';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows } from '../../common/db/db.service';
import { uuid } from '../../common/http/schemas';
import { RequestLang } from '../../common/http/lang';
import { ZodPipe } from '../../common/http/zod.pipe';
import { AnalyticsService } from '../analytics/analytics.service';
import { recordAiRun } from './ai-runs';
import { AiService } from './ai.service';

const chatBody = z.object({ message: z.string().min(2).max(4000), conversation_id: uuid.optional() });
const analyzeBody = z.object({ question: z.string().min(2).max(4000) });
const forecastBody = z.object({
  kpi_definition_id: uuid,
  horizon: z.number().int().min(1).max(36).default(6),
  season_length: z.number().int().min(0).max(52).default(12),
  scenario: z.object({ change_pct: z.number().min(-90).max(500) }).optional(),
});

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly db: DbService,
    private readonly ai: AiService,
    private readonly engine: AiEngineClient,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  @Post('chat')
  @RequirePermission('ai.use')
  chat(@CurrentPrincipal() p: AuthPrincipal, @RequestLang() lang: Lang, @Body(new ZodPipe(chatBody)) body: z.infer<typeof chatBody>) {
    return this.ai.chat(p, body.message, lang, body.conversation_id);
  }

  @Post('analyze')
  @RequirePermission('ai.use')
  analyze(@CurrentPrincipal() p: AuthPrincipal, @RequestLang() lang: Lang, @Body(new ZodPipe(analyzeBody)) body: z.infer<typeof analyzeBody>) {
    return this.ai.ask(p, body.question, lang);
  }

  @Get('conversations')
  @RequirePermission('ai.use')
  conversations(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'ai.use', (tx) =>
      rows(tx, 'SELECT id, title, created_at FROM ai.ai_conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [p.actorId]),
    );
  }

  @Get('conversations/:id')
  @RequirePermission('ai.use')
  conversation(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'ai.use', async (tx) => {
      const conv = await one(tx, 'SELECT id, title, created_at FROM ai.ai_conversations WHERE id = $1 AND user_id = $2', [id, p.actorId]);
      if (!conv) throw new NotFoundException();
      const messages = await rows<{ role: string; content: string }>(
        tx,
        'SELECT id, role, content, ai_run_id, created_at FROM ai.ai_messages WHERE conversation_id = $1 ORDER BY created_at',
        [id],
      );
      return {
        ...conv,
        messages: messages.map((m) => (m.role === 'assistant' ? { ...m, content: safeJson(m.content) } : m)),
      };
    });
  }

  @Get('runs/:id')
  @RequirePermission('ai.use')
  run(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'ai.use', async (tx) => {
      const run = await one(
        tx,
        `SELECT id, organization_id, model_name, model_version, runtime, task_type, status, result, confidence, created_at
         FROM ai.ai_runs WHERE id = $1`,
        [id],
      );
      if (!run) throw new NotFoundException();
      const sources = await rows(
        tx,
        `SELECT s.source_type, s.document_id, d.title AS document_title, s.page_number, s.query_code, s.excerpt, s.score
         FROM ai.ai_sources s LEFT JOIN core.documents d ON d.id = s.document_id WHERE s.ai_run_id = $1`,
        [id],
      );
      return { ...run, sources };
    });
  }

  /** KPI bo'yicha prognoz (va ixtiyoriy ssenariy), xatolik ko'rsatkichlari bilan saqlanadi. */
  @Post('forecast')
  @RequirePermission('ai.forecast')
  forecast(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(forecastBody)) body: z.infer<typeof forecastBody>) {
    return this.db.scoped(p, 'kpi.read', async (tx) => {
      const def = await one<{ organization_id: string; name: string }>(
        tx,
        'SELECT organization_id, name FROM analytics.kpi_definitions WHERE id = $1',
        [body.kpi_definition_id],
      );
      if (!def) throw new NotFoundException('KPI not found');
      const series = await this.analytics.kpiSeries(tx, body.kpi_definition_id);
      const result = await this.engine.forecast({
        series, horizon: body.horizon, season_length: body.season_length, scenario: body.scenario,
      });
      const runId = await recordAiRun(tx, p, {
        organizationId: def.organization_id,
        taskType: 'forecast',
        input: body,
        meta: { model_name: result.method, model_version: 'statistical-1', runtime: 'local' },
        result,
        confidence: null,
        sources: [{ source_type: 'kpi', query_code: `kpi:${body.kpi_definition_id}`, excerpt: `${series.length} observations` }],
      });
      const saved = await one(
        tx,
        `INSERT INTO analytics.forecasts (organization_id, kpi_definition_id, ai_run_id, method, horizon, points, metrics, scenario, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          def.organization_id, body.kpi_definition_id, runId, result.method, body.horizon,
          JSON.stringify(result.points), JSON.stringify(result.metrics), body.scenario ? JSON.stringify(body.scenario) : null, p.actorId,
        ],
      );
      await this.audit.record(tx, p, {
        action: 'ai.forecast', resourceType: 'analytics.forecasts', resourceId: (saved as any).id, organizationId: def.organization_id,
      });
      return { ...saved, history: series, anomalies: result.anomalies };
    });
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { answer: s };
  }
}

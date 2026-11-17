import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiEngineClient, Lang, RagHit } from '../../common/ai/ai-engine.client';
import { AuditService } from '../../common/audit/audit.service';
import { classificationAllows, Classification } from '../../common/auth/access-policy';
import { AuthPrincipal, grantsFor, hasPermission } from '../../common/auth/principal';
import { DbService, one, rows } from '../../common/db/db.service';
import { AnalyticsService, runCatalogQuery } from '../analytics/analytics.service';
import { homeOrganization, recordAiRun, SourceRef } from './ai-runs';

const CATALOG_PERMISSION: Record<string, string> = {
  tasks: 'tasks.read',
  kpi: 'kpi.read',
  reports: 'reports.read',
};

export interface AnswerResult {
  answer: string;
  intent: string;
  query_code: string | null;
  rows: unknown[];
  chart: unknown;
  highlights: string[];
  sources: SourceRef[] | (RagHit & { source_type: 'document' })[];
  model: { name: string; version: string; runtime: string };
  confidence: number;
  ai_run_id: string | null;
  notice: string;
}

/** Foydalanuvchi ko'ra oladigan eng yuqori maxfiylik darajasi (AI modeli tanlash uchun). */
export function effectiveClassification(p: AuthPrincipal, permission: string): Classification {
  return grantsFor(p, permission)
    .map((g) => g.c)
    .reduce<Classification>((max, c) => (classificationAllows(max, c) ? max : c), 'public');
}

@Injectable()
export class AiService {
  constructor(
    private readonly db: DbService,
    private readonly ai: AiEngineClient,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tabiiy tildagi savol: 1) reja (katalogdan so'rov tanlash) 2) so'rovni RLS doirasida bajarish
   * 3) natijani izohlash. Ma'lumot so'rovi bo'lmasa — hujjatlar bo'yicha RAG.
   */
  async ask(p: AuthPrincipal, question: string, lang: Lang): Promise<AnswerResult> {
    const plan = await this.ai.plan(question);

    if (plan.intent === 'data' && plan.query_code) {
      const domain = plan.query_code.split('.')[0];
      const permission = CATALOG_PERMISSION[domain];
      if (!permission || !hasPermission(p, permission)) throw new ForbiddenException('No access to this data');

      const data = await this.db.scoped(p, permission, async (tx) => {
        const result = await runCatalogQuery(this.analytics, tx, plan.query_code!, plan.params);
        if (result === null) throw new BadRequestException('Unknown query');
        return result as unknown[];
      });
      const classification = effectiveClassification(p, permission);
      const explained = await this.ai.explain({ question, query_code: plan.query_code, rows: data, classification, lang, params: plan.params });
      const sources: SourceRef[] = [{ source_type: 'query', query_code: plan.query_code, excerpt: JSON.stringify(plan.params) }];
      const runId = await this.saveRun(p, 'analyze', { question, plan }, explained, { answer: explained.answer, rows: data.length }, explained.confidence, sources);
      return {
        answer: explained.answer,
        intent: 'data',
        query_code: plan.query_code,
        rows: data,
        chart: explained.chart ?? null,
        highlights: explained.highlights,
        sources,
        model: { name: explained.model_name, version: explained.model_version, runtime: explained.runtime },
        confidence: explained.confidence,
        ai_run_id: runId,
        notice: 'ai_generated_review_required',
      };
    }

    if (!hasPermission(p, 'documents.read')) throw new ForbiddenException('No access to documents');
    const grants = grantsFor(p, 'documents.read');
    const rag = await this.ai.ragAnswer({ question, grants, classification: effectiveClassification(p, 'documents.read'), lang });
    // Himoya chizig'i: qaytgan har bir hujjat DB'da ham shu foydalanuvchiga ko'rinishi shart.
    const visibleIds = await this.visibleDocumentIds(p, rag.hits.map((h) => h.document_id));
    const hits = rag.hits.filter((h) => visibleIds.has(h.document_id));
    // Agar indeksda foydalanuvchiga ko'rinmaydigan hujjat qaytgan bo'lsa, javob matni unga tayangan
    // bo'lishi mumkin — shuning uchun matn qaytarilmaydi.
    const leaked = hits.length !== rag.hits.length;
    const sources: SourceRef[] = hits.map((h) => ({
      source_type: 'document', document_id: h.document_id, page_number: h.page, excerpt: h.text, score: h.score,
    }));
    const runId = await this.saveRun(p, 'rag', { question }, rag, { answer: leaked ? '' : rag.answer }, rag.confidence, sources);
    return {
      answer: leaked ? '' : rag.answer,
      intent: 'documents',
      query_code: null,
      rows: [],
      chart: null,
      highlights: [],
      sources: hits.map((h) => ({ ...h, source_type: 'document' as const })),
      model: { name: rag.model_name, version: rag.model_version, runtime: rag.runtime },
      confidence: leaked ? 0 : rag.confidence,
      ai_run_id: runId,
      notice: leaked ? 'answer_withheld_scope_mismatch' : 'ai_generated_review_required',
    };
  }

  async visibleDocumentIds(p: AuthPrincipal, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const found = await this.db.scoped(p, 'documents.read', (tx) =>
      rows<{ id: string }>(tx, 'SELECT id FROM core.documents WHERE id = ANY($1::uuid[])', [ids]),
    );
    return new Set(found.map((r) => r.id));
  }

  private async saveRun(
    p: AuthPrincipal,
    taskType: string,
    input: unknown,
    meta: { model_name: string; model_version: string; runtime: 'local' | 'central' },
    result: unknown,
    confidence: number,
    sources: SourceRef[],
  ): Promise<string | null> {
    return this.db.scoped(p, 'ai.use', async (tx) => {
      const orgId = await homeOrganization(tx, p);
      if (!orgId) return null;
      const id = await recordAiRun(tx, p, { organizationId: orgId, taskType, input, meta, result, confidence, sources });
      await this.audit.record(tx, p, {
        action: `ai.${taskType}`, resourceType: 'ai.ai_runs', resourceId: id, organizationId: orgId,
        data: { model: meta.model_name, version: meta.model_version, runtime: meta.runtime, sources: sources.length },
      });
      return id;
    });
  }

  async chat(p: AuthPrincipal, message: string, lang: Lang, conversationId?: string) {
    const answer = await this.ask(p, message, lang);
    return this.db.scoped(p, 'ai.use', async (tx) => {
      let convId = conversationId;
      if (convId) {
        const conv = await one(tx, 'SELECT id FROM ai.ai_conversations WHERE id = $1 AND user_id = $2', [convId, p.actorId]);
        if (!conv) throw new NotFoundException('Conversation not found');
      } else {
        const orgId = await homeOrganization(tx, p);
        if (!orgId) throw new ForbiddenException('No organization in scope');
        const conv = await one<{ id: string }>(
          tx,
          'INSERT INTO ai.ai_conversations (organization_id, user_id, title) VALUES ($1, $2, $3) RETURNING id',
          [orgId, p.actorId, message.slice(0, 120)],
        );
        convId = conv!.id;
      }
      await tx.query('INSERT INTO ai.ai_messages (conversation_id, role, content) VALUES ($1, $2, $3)', [convId, 'user', message]);
      await tx.query('INSERT INTO ai.ai_messages (conversation_id, role, content, ai_run_id) VALUES ($1, $2, $3, $4)', [
        convId, 'assistant', JSON.stringify(answer), answer.ai_run_id,
      ]);
      return { conversation_id: convId, ...answer };
    });
  }
}

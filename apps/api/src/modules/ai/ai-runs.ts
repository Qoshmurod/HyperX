import { createHash } from 'node:crypto';
import { AiMeta } from '../../common/ai/ai-engine.client';
import { AuthPrincipal } from '../../common/auth/principal';
import { one, Tx } from '../../common/db/db.service';

export interface SourceRef {
  source_type: 'document' | 'query' | 'kpi' | 'task';
  document_id?: string;
  page_number?: number | null;
  query_code?: string;
  excerpt?: string;
  score?: number;
}

/** Har bir AI bajarilishi: model, versiya, kirish xeshi, natija va manbalar. */
export async function recordAiRun(
  tx: Tx,
  p: AuthPrincipal,
  args: {
    organizationId: string;
    taskType: string;
    input: unknown;
    meta: AiMeta;
    result: unknown;
    confidence?: number | null;
    sources?: SourceRef[];
    status?: 'succeeded' | 'failed' | 'rejected';
  },
): Promise<string> {
  const inputHash = createHash('sha256').update(JSON.stringify(args.input)).digest('hex');
  const run = await one<{ id: string }>(
    tx,
    `INSERT INTO ai.ai_runs (organization_id, user_id, model_name, model_version, runtime, task_type, input_hash, status, result,
                             confidence, prompt_tokens, output_tokens, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()) RETURNING id`,
    [
      args.organizationId, p.actorId, args.meta.model_name, args.meta.model_version, args.meta.runtime, args.taskType,
      inputHash, args.status ?? 'succeeded', JSON.stringify(args.result), args.confidence ?? null,
      args.meta.prompt_tokens ?? null, args.meta.output_tokens ?? null,
    ],
  );
  for (const s of args.sources ?? []) {
    await tx.query(
      `INSERT INTO ai.ai_sources (ai_run_id, source_type, document_id, page_number, query_code, excerpt, score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [run!.id, s.source_type, s.document_id ?? null, s.page_number ?? null, s.query_code ?? null, s.excerpt?.slice(0, 2000) ?? null, s.score ?? null],
    );
  }
  return run!.id;
}

/** AI natijasini saqlash uchun tashkilot: foydalanuvchining birinchi a'zoligi yoki doiradagi birinchi tashkilot. */
export async function homeOrganization(tx: Tx, p: AuthPrincipal): Promise<string | null> {
  const row = await one<{ id: string }>(
    tx,
    `SELECT COALESCE(
        (SELECT m.organization_id FROM iam.organization_memberships m WHERE m.user_id = $1 AND app.org_visible(m.organization_id) LIMIT 1),
        (SELECT o.id FROM organization.organizations o JOIN organization.administrative_units u ON u.id = o.administrative_unit_id
          ORDER BY nlevel(u.path), o.name LIMIT 1)) AS id`,
    [p.actorId],
  );
  return row?.id ?? null;
}

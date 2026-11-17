import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { DbGrant } from '../auth/principal';

export type Lang = 'uz' | 'uz-Cyrl' | 'ru' | 'en';

export interface AiMeta {
  model_name: string;
  model_version: string;
  runtime: 'local' | 'central';
  prompt_tokens?: number;
  output_tokens?: number;
}

export interface PlanResult {
  query_code: string | null;
  params: Record<string, unknown>;
  confidence: number;
  intent: 'data' | 'documents' | 'unknown';
  normalized: string;
}

export interface ExplainResult extends AiMeta {
  answer: string;
  highlights: string[];
  confidence: number;
  chart?: { type: string; x: string; y: string[] } | null;
}

export interface RagHit {
  document_id: string;
  title: string;
  page: number | null;
  text: string;
  score: number;
}

/** AI engine bilan ichki aloqa. Foydalanuvchi vakolat konteksti har bir so'rov bilan uzatiladi. */
@Injectable()
export class AiEngineClient {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async call<T>(path: string, body: unknown, init?: { raw?: FormData }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.aiEngine.timeoutMs);
    try {
      const res = await fetch(`${this.config.aiEngine.url}${path}`, {
        method: 'POST',
        headers: init?.raw
          ? { 'X-Internal-Token': this.config.aiEngine.token }
          : { 'Content-Type': 'application/json', 'X-Internal-Token': this.config.aiEngine.token },
        body: init?.raw ?? JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new ServiceUnavailableException(`AI engine error ${res.status}: ${detail.slice(0, 300)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException('AI engine is unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  plan(question: string) {
    return this.call<PlanResult>('/internal/v1/analyst/plan', { question });
  }

  explain(body: { question: string; query_code: string; rows: unknown[]; classification: string; lang: Lang }) {
    return this.call<ExplainResult>('/internal/v1/analyst/explain', body);
  }

  draftDecision(body: { problem: string; evidence: unknown[]; classification: string; lang: Lang }) {
    return this.call<AiMeta & { causes: string[]; options: unknown[]; confidence: number }>('/internal/v1/decisions/draft', body);
  }

  forecast(body: { series: { period: string; value: number }[]; horizon: number; season_length: number; scenario?: { change_pct: number } }) {
    return this.call<{ method: string; points: unknown[]; metrics: Record<string, number>; anomalies: unknown[] }>(
      '/internal/v1/forecast',
      body,
    );
  }

  anomalies(body: { series: { period: string; value: number }[]; threshold?: number }) {
    return this.call<{ anomalies: { period: string; value: number; expected: number; z: number }[] }>('/internal/v1/anomalies', body);
  }

  commentary(body: { report: unknown; classification: string; lang: Lang }) {
    return this.call<AiMeta & { text: string }>('/internal/v1/reports/commentary', body);
  }

  ragSearch(body: { query: string; grants: DbGrant[]; limit?: number }) {
    return this.call<{ hits: RagHit[] }>('/internal/v1/rag/search', body);
  }

  ragAnswer(body: { question: string; grants: DbGrant[]; classification: string; lang: Lang }) {
    return this.call<AiMeta & { answer: string; hits: RagHit[]; confidence: number }>('/internal/v1/rag/answer', body);
  }

  ragIndex(form: FormData) {
    return this.call<{ chunks: number; pages: number | null }>('/internal/v1/rag/index', null, { raw: form });
  }

  ragDelete(documentId: string) {
    return this.call<{ deleted: boolean }>('/internal/v1/rag/delete', { document_id: documentId });
  }
}

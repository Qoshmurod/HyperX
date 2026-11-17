'use client';

import { localizeText, type Locale } from '@govmind/i18n';
import { useRef, useState } from 'react';
import { BarChartClient } from './bar-client';

interface Labels {
  placeholder: string;
  send: string;
  sources: string;
  model: string;
  confidence: string;
  review: string;
  withheld: string;
  examples: string;
  error: string;
  forbidden: string;
  query: string;
  page: string;
}

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  data?: any;
}

export function AiChat({
  labels,
  examples,
  initial,
  conversationId,
  columns,
  locale,
}: {
  labels: Labels;
  examples: string[];
  initial: Msg[];
  conversationId?: string;
  columns: Record<string, string>;
  locale: Locale;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [conv, setConv] = useState<string | undefined>(conversationId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: q }]);
    try {
      const res = await fetch('/bff/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q, conversation_id: conv }) });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', text: data.error === 403 ? labels.forbidden : labels.error }]);
      } else {
        setConv(data.conversation_id);
        setMessages((m) => [...m, { role: 'assistant', text: data.answer, data }]);
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: labels.error }]);
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 text-xs font-medium text-muted">{labels.examples}</div>
          <div className="flex flex-wrap gap-2">
            {examples.map((e) => (
              <button key={e} onClick={() => send(e)} className="rounded-full border border-border px-3 py-1.5 text-left text-sm hover:bg-surface-2">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-3" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={m.role === 'user' ? 'max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg' : 'rounded-lg border border-border bg-surface p-4 text-sm'}>
              {m.role === 'assistant' && m.data?.notice === 'answer_withheld_scope_mismatch' ? (
                <p className="text-warn">{labels.withheld}</p>
              ) : (
                <p className="whitespace-pre-wrap">{m.text}</p>
              )}
              {m.data && <AnswerDetails data={m.data} labels={labels} columns={columns} locale={locale} />}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-muted">…</div>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-2 flex gap-2 rounded-lg border border-border bg-surface p-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder={labels.placeholder}
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
          aria-label={labels.placeholder}
        />
        <button disabled={busy || !input.trim()} className="self-end rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
          {labels.send}
        </button>
      </form>
    </div>
  );
}

const TEXT_COLUMNS = new Set(['organization_name', 'kpi_name', 'unit']);

function AnswerDetails({ data, labels, columns, locale }: { data: any; labels: Labels; columns: Record<string, string>; locale: Locale }) {
  const rows: any[] = (data.rows ?? []).map((r: any) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, TEXT_COLUMNS.has(k) && typeof v === 'string' ? localizeText(locale, v) : v])),
  );
  const chart = data.chart;
  const col = (k: string) => columns[k] ?? k;
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {chart && rows.length > 0 && (
        <BarChartClient labels={rows.slice(0, 12).map((r) => String(r[chart.x] ?? ''))} series={chart.y.map((k: string) => ({ label: col(k), values: rows.slice(0, 12).map((r) => (r[k] === null ? null : Number(r[k]))) }))} />
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="text-left text-muted">
                {Object.keys(rows[0]).filter((k) => !k.endsWith('_id')).map((k) => (
                  <th key={k} className="px-1 py-1 font-medium">{col(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {Object.entries(r).filter(([k]) => !k.endsWith('_id')).map(([k, v]) => (
                    <td key={k} className="px-1 py-1">{v === null ? '—' : String(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs text-muted">
        <span className="font-medium">{labels.sources}: </span>
        {data.query_code && <span>{labels.query} <code>{data.query_code}</code></span>}
        {(data.sources ?? [])
          .filter((s: any) => s.source_type === 'document')
          .map((s: any, i: number) => (
            <a key={i} className="mr-2 text-accent" href={`/download/documents/${s.document_id}`}>
              {s.title}
              {s.page ? `, ${labels.page} ${s.page}` : ''}
            </a>
          ))}
      </div>
      <div className="text-xs text-muted">
        {labels.model}: {data.model?.name} {data.model?.version} ({data.model?.runtime}) · {labels.confidence}: {Math.round((data.confidence ?? 0) * 100)}%
      </div>
      <p className="text-xs text-warn">{labels.review}</p>
    </div>
  );
}

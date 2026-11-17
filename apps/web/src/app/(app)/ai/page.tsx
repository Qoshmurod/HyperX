import Link from 'next/link';
import { AiChat } from '@/components/ai-chat';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';

export default async function AiPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { t, fmtDate, locale } = await getT();
  const sp = await searchParams;
  const conversations = await api('/ai/conversations');
  const conv = sp.c ? await api(`/ai/conversations/${sp.c}`).catch(() => null) : null;
  const initial = (conv?.messages ?? []).map((m: any) =>
    m.role === 'user' ? { role: 'user', text: m.content } : { role: 'assistant', text: m.content.answer ?? '', data: m.content },
  );
  return (
    <>
      <PageHeader title={t('ai.title')} subtitle={t('ai.review_required')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <AiChat
          key={sp.c ?? 'new'}
          conversationId={conv?.id}
          initial={initial}
          locale={locale}
          columns={{
            organization_name: t('common.organization'), total: t('common.total'), done: t('dashboard.tasks_done'),
            in_progress: t('dashboard.tasks_open'), new: t('tasks.status.new'), overdue: t('dashboard.tasks_overdue'),
            completion_pct: `${t('dashboard.completion')}, %`, late: t('dashboard.late'), late_pct: `${t('dashboard.late')}, %`,
            prev_late: t('dashboard.prev_late'), prev_late_pct: `${t('dashboard.prev_late')}, %`, kpi_name: t('common.name'),
            unit: t('kpi.unit'), planned_value: t('kpi.planned'), actual_value: t('kpi.actual'), attainment_pct: t('kpi.attainment'),
            period_start: t('common.period'), period_end: t('common.to'), value_a: 'A', value_b: 'B', change_pct: '%',
            month: t('common.period'), due: t('dashboard.due'), completed: t('dashboard.completed'), report_type: t('reports.type'),
            status: t('common.status'), created_at: t('common.created_at'), direction: t('kpi.direction'),
          }}
          examples={[t('ai.example1'), t('ai.example2'), t('ai.example3'), t('ai.example4'), t('ai.example5')]}
          labels={{
            placeholder: t('ai.placeholder'), send: t('ai.send'), sources: t('ai.sources'), model: t('ai.model'), confidence: t('ai.confidence'),
            review: t('ai.review_required'), withheld: t('ai.withheld'), examples: t('ai.examples'), error: t('common.error'),
            forbidden: t('common.forbidden'), query: t('ai.query'), page: t('documents.page'),
          }}
        />
        <aside className="space-y-2">
          <Link href="/ai" className="block rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2">
            + {t('ai.new_conversation')}
          </Link>
          <div className="text-xs font-medium text-muted">{t('ai.conversations')}</div>
          {conversations.slice(0, 30).map((c: any) => (
            <Link key={c.id} href={`/ai?c=${c.id}`} className="block rounded-md px-3 py-2 text-sm hover:bg-surface-2">
              <div className="truncate">{c.title}</div>
              <div className="text-xs text-muted">{fmtDate(c.created_at, true)}</div>
            </Link>
          ))}
        </aside>
      </div>
    </>
  );
}

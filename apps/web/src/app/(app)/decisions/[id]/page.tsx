import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Field, Notice, PageHeader, Textarea } from '@/components/ui';
import { api, can, getMe } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { reviewDecision } from '../actions';

const COST_TONE: Record<string, 'ok' | 'warn' | 'danger'> = { low: 'ok', medium: 'warn', high: 'danger' };

export default async function DecisionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { t, lx, fmtDate } = await getT();
  const [d, me, canApprove] = await Promise.all([api(`/decisions/${id}`), getMe(), can('decisions.approve')]);
  const isAuthor = d.created_by === me.id;
  const reviewable = d.status === 'under_review' && canApprove && !isAuthor;
  return (
    <>
      <PageHeader
        title={d.title}
        subtitle={`${lx(d.organization_name)} · ${d.created_by_name} · ${fmtDate(d.created_at, true)}`}
        actions={<Badge tone={d.status === 'approved' ? 'ok' : d.status === 'rejected' ? 'danger' : 'warn'}>{t(`decisions.status.${d.status}` as any)}</Badge>}
      />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Notice tone="warn">{t('decisions.human_note')}</Notice>
        <Card title={t('decisions.problem')}>
          <p className="whitespace-pre-wrap text-sm">{d.problem}</p>
        </Card>
        <Card title={t('decisions.causes')}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(d.analysis?.causes ?? []).map((c: string, i: number) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            {t('ai.sources')}: {(d.analysis?.evidence ?? []).map((e: any) => e.query_code).join(', ')} · {t('ai.model')}: {d.model_name} {d.model_version} ({d.runtime})
          </p>
        </Card>
        <form action={reviewDecision} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={d.version} />
          <div className="grid gap-3 lg:grid-cols-3">
            {(d.options ?? []).map((o: any, i: number) => (
              <label key={i} className={`block rounded-lg border bg-surface p-4 ${d.selected_option === i ? 'border-ok' : 'border-border'}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold">{i + 1}. {o.title}</span>
                  <Badge tone={COST_TONE[o.cost]}>{t('decisions.cost')}: {o.cost}</Badge>
                </div>
                <p className="text-sm">{o.description}</p>
                {o.expected_impact && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">{t('decisions.impact')}: </span>
                    {o.expected_impact}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted">{(o.assumptions ?? []).join(' ')}</p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">{t('decisions.risks')}: </span>
                  {(o.risks ?? []).join('; ')}
                </p>
                <p className="text-sm">
                  <span className="font-medium">{t('decisions.constraints')}: </span>
                  {(o.constraints ?? []).join('; ')}
                </p>
                {reviewable && (
                  <span className="mt-3 flex items-center gap-2 text-sm">
                    <input type="radio" name="selected_option" value={i} required /> {t('decisions.select')}
                  </span>
                )}
                {d.selected_option === i && <Badge tone="ok">{t('decisions.selected')}</Badge>}
              </label>
            ))}
          </div>
          {d.status === 'draft' && isAuthor && (
            <Button name="action" value="submit" variant="secondary">
              {t('common.submit')}
            </Button>
          )}
          {d.status === 'under_review' && isAuthor && <Notice>{t('decisions.four_eyes')}</Notice>}
          {reviewable && (
            <Card>
              <Field label={t('common.note')}>
                <Textarea name="note" required minLength={3} />
              </Field>
              <div className="mt-3 flex gap-2">
                <Button name="action" value="approve">{t('common.approve')}</Button>
                <Button name="action" value="reject" variant="danger" formNoValidate>
                  {t('common.reject')}
                </Button>
              </div>
            </Card>
          )}
        </form>
        {d.reviewed_by_name && (
          <Notice tone={d.status === 'approved' ? 'ok' : 'danger'}>
            {t('decisions.reviewer')}: {d.reviewed_by_name} · {fmtDate(d.reviewed_at, true)} — {d.review_note}
          </Notice>
        )}
      </div>
    </>
  );
}

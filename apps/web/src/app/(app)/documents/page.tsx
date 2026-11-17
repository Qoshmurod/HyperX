import { ClassBadge } from '@/components/badges';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { uploadDocument } from './actions';

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { t, lx, locale, fmtDate } = await getT();
  const sp = await searchParams;
  const [docs, canUpload] = await Promise.all([api('/documents'), can('documents.upload')]);
  const orgs = canUpload ? await api('/organizations') : [];
  const results = sp.q ? (await api('/documents/search', { method: 'POST', json: { query: sp.q } })).hits : null;
  return (
    <>
      <PageHeader title={t('documents.title')} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Card title={t('documents.search')}>
          <form className="flex gap-2">
            <Input name="q" defaultValue={sp.q} placeholder={t('common.search')} />
            <Button variant="secondary">{t('common.search')}</Button>
          </form>
          {results && (
            <ul className="mt-4 space-y-3">
              {results.length === 0 && <li className="text-sm text-muted">{t('common.none')}</li>}
              {results.map((h: any, i: number) => (
                <li key={i} className="rounded-md border border-border p-3 text-sm">
                  <a className="font-medium text-accent" href={`/download/documents/${h.document_id}`}>
                    {h.title}
                  </a>
                  {h.page && <span className="text-xs text-muted"> · {t('documents.page')} {h.page}</span>}
                  <span className="text-xs text-muted"> · {Math.round(h.score * 100)}%</span>
                  <p className="mt-1 whitespace-pre-wrap text-muted">{h.text.slice(0, 500)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canUpload && (
          <Card title={t('documents.upload')}>
            <form action={uploadDocument} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label={t('common.organization')}>
                <Select name="organization_id" options={orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }))} />
              </Field>
              <Field label={t('common.name')}>
                <Input name="title" required minLength={2} />
              </Field>
              <Field label={t('common.classification')}>
                <Select name="classification" defaultValue="internal" options={['public', 'internal', 'confidential', 'secret'].map((c) => ({ value: c, label: t(`classification.${c}` as any) }))} />
              </Field>
              <Field label={t('documents.file')}>
                <Input type="file" name="file" required accept=".pdf,.docx,.txt,.md" />
              </Field>
              <div className="flex items-end">
                <Button>{t('documents.upload')}</Button>
              </div>
            </form>
          </Card>
        )}
        <Card>
          <Table
            empty={t('common.none')}
            rows={docs}
            columns={[
              { key: 'title', label: t('common.name'), render: (r) => <a className="text-accent" href={`/download/documents/${r.id}`}>{r.title}</a> },
              { key: 'organization_name', label: t('common.organization'), render: (r) => lx(r.organization_name) },
              { key: 'classification', label: t('common.classification'), render: (r) => <ClassBadge value={r.classification} locale={locale} /> },
              {
                key: 'index_status', label: t('documents.index_status'),
                render: (r) => <Badge tone={r.index_status === 'indexed' ? 'ok' : r.index_status === 'failed' ? 'danger' : 'warn'}>{t(`documents.index.${r.index_status}` as any)}</Badge>,
              },
              { key: 'chunk_count', label: t('documents.chunks'), align: 'right' },
              { key: 'created_at', label: t('common.created_at'), render: (r) => fmtDate(r.created_at, true) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

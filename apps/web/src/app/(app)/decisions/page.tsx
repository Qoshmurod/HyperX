import Link from 'next/link';
import { Badge, Card, LinkButton, Notice, PageHeader, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = { approved: 'ok', under_review: 'warn', rejected: 'danger', draft: 'neutral' };

export default async function DecisionsPage() {
  const { t, lx, fmtDate } = await getT();
  const items = await api('/decisions');
  return (
    <>
      <PageHeader title={t('decisions.title')} actions={<LinkButton href="/decisions/new">{t('decisions.new')}</LinkButton>} />
      <div className="space-y-4">
        <Notice>{t('decisions.human_note')}</Notice>
        <Card>
          <Table
            empty={t('common.none')}
            rows={items}
            columns={[
              { key: 'title', label: t('common.name'), render: (r) => <Link className="font-medium text-accent" href={`/decisions/${r.id}`}>{r.title}</Link> },
              { key: 'organization_name', label: t('common.organization'), render: (r) => lx(r.organization_name) },
              { key: 'status', label: t('common.status'), render: (r) => <Badge tone={STATUS_TONE[r.status]}>{t(`decisions.status.${r.status}` as any)}</Badge> },
              { key: 'created_by_name', label: t('tasks.created_by') },
              { key: 'created_at', label: t('common.created_at'), render: (r) => fmtDate(r.created_at, true) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

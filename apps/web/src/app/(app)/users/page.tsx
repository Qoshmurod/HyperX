import Link from 'next/link';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { createUser } from './actions';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { t, lx } = await getT();
  const sp = await searchParams;
  const [users, orgs] = await Promise.all([api(`/users${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ''}`), api('/organizations')]);
  return (
    <>
      <PageHeader title={t('users.title')} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Card actions={<form><Input name="q" defaultValue={sp.q} placeholder={t('common.search')} /></form>}>
          <Table
            empty={t('common.none')}
            rows={users}
            columns={[
              { key: 'full_name', label: t('users.full_name'), render: (r) => <Link className="font-medium text-accent" href={`/users/${r.id}`}>{r.full_name}</Link> },
              { key: 'username', label: t('users.username') },
              { key: 'memberships', label: t('common.organization'), render: (r) => (r.memberships ?? []).map((m: any) => lx(m.name)).join(', ') || '—' },
              {
                key: 'status', label: t('common.status'),
                render: (r) => (
                  <span className="flex gap-1">
                    <Badge tone={r.status === 'active' ? 'ok' : 'danger'}>{t(`users.status.${r.status}` as any)}</Badge>
                    {r.pending_link && <Badge tone="warn">{t('users.pending_link')}</Badge>}
                  </span>
                ),
              },
            ]}
          />
        </Card>
        <Card title={t('users.new')} className="max-w-3xl">
          <form action={createUser} className="grid gap-3 sm:grid-cols-2">
            <Field label={t('users.username')} hint="Keycloak login">
              <Input name="username" required pattern="[a-z0-9._-]{3,100}" />
            </Field>
            <Field label={t('users.full_name')}>
              <Input name="full_name" required minLength={3} />
            </Field>
            <Field label={t('users.email')}>
              <Input name="email" type="email" />
            </Field>
            <Field label={t('users.position')}>
              <Input name="position" />
            </Field>
            <Field label={t('common.organization')}>
              <Select name="organization_id" options={orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }))} />
            </Field>
            <div className="flex items-end">
              <Button>{t('common.create')}</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

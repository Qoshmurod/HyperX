import Link from 'next/link';
import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Field, Grid, Input, PageHeader, Select, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { createOrganization, createUnit } from './actions';

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const { t, lx } = await getT();
  const sp = await searchParams;
  const [orgs, units, canManage] = await Promise.all([api(`/organizations${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ''}`), api('/administrative-units'), can('organizations.manage')]);
  const depth = (p: string) => p.split('.').length - 1;
  return (
    <>
      <PageHeader title={t('org.title')} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Grid cols={2}>
          <Card title={t('org.units')}>
            <ul className="space-y-1 text-sm">
              {units.map((u: any) => (
                <li key={u.id} style={{ paddingLeft: `${depth(u.path) * 16}px` }} className="flex items-center gap-2">
                  <span>{lx(u.name)}</span>
                  <Badge>{t(`level.${u.level}` as any)}</Badge>
                  <code className="text-xs text-muted">{u.path}</code>
                </li>
              ))}
            </ul>
          </Card>
          {canManage && (
            <Card title={t('org.new_unit')}>
              <form action={createUnit} className="grid gap-3 sm:grid-cols-2">
                <Field label={t('org.parent_unit')}>
                  <Select name="parent_id" options={units.filter((u: any) => u.level !== 'district').map((u: any) => ({ value: u.id, label: lx(u.name) }))} />
                </Field>
                <Field label={t('common.type')}>
                  <Select name="level" options={['region', 'district'].map((l) => ({ value: l, label: t(`level.${l}` as any) }))} />
                </Field>
                <Field label={t('common.name')}>
                  <Input name="name" required />
                </Field>
                <Field label={t('common.code')}>
                  <Input name="code" required pattern="[A-Za-z0-9_-]{2,100}" />
                </Field>
                <Field label={t('org.slug')}>
                  <Input name="slug" required pattern="[a-z0-9_]{1,60}" />
                </Field>
                <div className="flex items-end">
                  <Button>{t('common.create')}</Button>
                </div>
              </form>
            </Card>
          )}
        </Grid>
        <Card
          title={t('org.title')}
          actions={
            <form className="flex gap-2">
              <Input name="q" defaultValue={sp.q} placeholder={t('common.search')} />
            </form>
          }
        >
          <Table
            empty={t('common.none')}
            rows={orgs}
            columns={[
              { key: 'name', label: t('common.name'), render: (r) => <Link className="font-medium text-accent" href={`/organizations/${r.id}`}>{lx(r.name)}</Link> },
              { key: 'code', label: t('common.code') },
              { key: 'organization_type', label: t('common.type') },
              { key: 'unit_name', label: t('common.unit'), render: (r) => lx(r.unit_name) },
              { key: 'status', label: t('common.status'), render: (r) => <Badge tone={r.status === 'active' ? 'ok' : 'neutral'}>{t(`org.status.${r.status}` as any)}</Badge> },
            ]}
          />
        </Card>
        {canManage && (
          <Card title={t('org.new')} className="max-w-3xl">
            <form action={createOrganization} className="grid gap-3 sm:grid-cols-2">
              <Field label={t('common.unit')}>
                <Select name="administrative_unit_id" options={units.map((u: any) => ({ value: u.id, label: lx(u.name) }))} />
              </Field>
              <Field label={t('common.name')}>
                <Input name="name" required />
              </Field>
              <Field label={t('common.code')}>
                <Input name="code" required pattern="[A-Za-z0-9_-]{2,100}" />
              </Field>
              <Field label={t('common.type')}>
                <Input name="organization_type" required placeholder="hokimlik, bo'lim, boshqarma" />
              </Field>
              <div>
                <Button>{t('common.create')}</Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}

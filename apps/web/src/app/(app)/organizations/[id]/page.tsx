import { ErrorNotice } from '@/components/error-notice';
import { Button, Card, Field, Grid, Input, PageHeader, Select, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { createDepartment, updateOrganization } from '../actions';

export default async function OrganizationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { t, lx } = await getT();
  const [o, members, canManage] = await Promise.all([api(`/organizations/${id}`), api(`/organizations/${id}/members`), can('organizations.manage')]);
  return (
    <>
      <PageHeader title={lx(o.name)} subtitle={`${o.code} · ${lx(o.unit_name)} · ${o.unit_path}`} />
      <ErrorNotice code={sp.error} />
      <Grid cols={2}>
        <Card title={t('org.departments')}>
          <ul className="space-y-1 text-sm">
            {o.departments.map((d: any) => (
              <li key={d.id}>{lx(d.name)}</li>
            ))}
            {o.departments.length === 0 && <li className="text-muted">{t('common.none')}</li>}
          </ul>
          {canManage && (
            <form action={createDepartment} className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={id} />
              <Input name="name" required minLength={2} placeholder={t('org.new_department')} />
              <Button variant="secondary">{t('common.create')}</Button>
            </form>
          )}
        </Card>
        <Card title={t('users.title')}>
          <Table empty={t('common.none')} rows={members} columns={[{ key: 'full_name', label: t('users.full_name') }, { key: 'position', label: t('users.position') }]} />
        </Card>
        {canManage && (
          <Card title={t('common.save')}>
            <form action={updateOrganization} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={o.version} />
              <Field label={t('common.name')}>
                <Input name="name" defaultValue={o.name} required />
              </Field>
              <Field label={t('common.status')}>
                <Select name="status" defaultValue={o.status} options={['active', 'suspended', 'archived'].map((s) => ({ value: s, label: t(`org.status.${s}` as any) }))} />
              </Field>
              <Button>{t('common.save')}</Button>
            </form>
          </Card>
        )}
      </Grid>
    </>
  );
}

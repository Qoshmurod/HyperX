import { ErrorNotice } from '@/components/error-notice';
import { ClassBadge } from '@/components/badges';
import { Badge, Button, Card, Field, Grid, Input, Notice, PageHeader, Select, Table } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { grantRole, revokeRole, setStatus } from '../actions';

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { t, lx, locale, fmtDate } = await getT();
  const [u, roles, units, canGrant] = await Promise.all([api(`/users/${id}`), api('/roles'), api('/administrative-units'), can('roles.manage')]);
  return (
    <>
      <PageHeader
        title={u.full_name}
        subtitle={`${u.username}${u.email ? ` · ${u.email}` : ''}`}
        actions={
          <span className="flex gap-1">
            <Badge tone={u.status === 'active' ? 'ok' : 'danger'}>{t(`users.status.${u.status}` as any)}</Badge>
            {u.pending_link && <Badge tone="warn">{t('users.pending_link')}</Badge>}
          </span>
        }
      />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Card title={t('users.roles')}>
          <Table
            empty={t('common.none')}
            rows={u.grants}
            columns={[
              { key: 'role_code', label: t('common.type'), render: (g) => t(`role.${g.role_code}` as any) },
              { key: 'unit_name', label: t('common.unit'), render: (g) => `${lx(g.unit_name)} (${g.unit_path})` },
              { key: 'max_classification', label: t('common.classification'), render: (g) => <ClassBadge value={g.max_classification} locale={locale} /> },
              { key: 'valid_until', label: t('users.valid_until'), render: (g) => fmtDate(g.valid_until) },
              {
                key: 'actions', label: '', render: (g) => canGrant && (
                  <form action={revokeRole}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="grant_id" value={g.id} />
                    <button className="text-xs text-danger">{t('users.revoke')}</button>
                  </form>
                ),
              },
            ]}
          />
          {canGrant && (
            <form action={grantRole} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input type="hidden" name="id" value={id} />
              <Field label={t('common.type')}>
                <Select name="role_code" options={roles.map((r: any) => ({ value: r.code, label: t(`role.${r.code}` as any) }))} />
              </Field>
              <Field label={t('common.unit')}>
                <Select name="administrative_unit_id" options={units.map((x: any) => ({ value: x.id, label: lx(x.name) }))} />
              </Field>
              <Field label={t('common.classification')}>
                <Select name="max_classification" defaultValue="internal" options={['public', 'internal', 'confidential', 'secret'].map((c) => ({ value: c, label: t(`classification.${c}` as any) }))} />
              </Field>
              <Field label={t('users.valid_until')}>
                <Input type="date" name="valid_until" />
              </Field>
              <div className="flex items-end">
                <Button>{t('users.grant')}</Button>
              </div>
            </form>
          )}
          <div className="mt-3">
            <Notice>{t('users.escalation_hint')}</Notice>
          </div>
        </Card>
        <Grid cols={2}>
          <Card title={t('common.organization')}>
            <ul className="text-sm">
              {u.memberships.map((m: any) => (
                <li key={m.organization_id}>
                  {lx(m.name)} {m.position && <span className="text-muted">· {m.position}</span>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t('common.status')}>
            <form action={setStatus} className="flex gap-2">
              <input type="hidden" name="id" value={id} />
              <Select name="status" defaultValue={u.status} options={['active', 'locked', 'disabled'].map((s) => ({ value: s, label: t(`users.status.${s}` as any) }))} />
              <Button variant="secondary">{t('common.save')}</Button>
            </form>
          </Card>
        </Grid>
      </div>
    </>
  );
}

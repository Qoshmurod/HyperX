import { ClassBadge, PriorityBadge, StatusBadge } from '@/components/badges';
import { ErrorNotice } from '@/components/error-notice';
import { Button, Card, Field, Grid, Input, PageHeader, Select } from '@/components/ui';
import { api, can } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { assignTask, unassignTask, updateTask } from '../actions';

function toLocal(iso: string | null) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { t, lx, locale, fmtDate } = await getT();
  const task = await api(`/tasks/${id}`);
  const canManage = await can('tasks.manage');
  const members = canManage ? await api(`/organizations/${task.organization_id}/members`).catch(() => []) : [];
  return (
    <>
      <PageHeader title={task.title} subtitle={lx(task.organization_name)} />
      <ErrorNotice code={sp.error} />
      <div className="space-y-4">
        <Grid cols={4}>
          <Card title={t('common.status')}>
            <StatusBadge status={task.status} overdue={task.overdue} locale={locale} />
          </Card>
          <Card title={t('tasks.priority')}>
            <PriorityBadge priority={task.priority} locale={locale} />
          </Card>
          <Card title={t('tasks.deadline')}>{fmtDate(task.deadline, true)}</Card>
          <Card title={t('common.classification')}>
            <ClassBadge value={task.classification} locale={locale} />
          </Card>
        </Grid>
        {task.description && (
          <Card title={t('common.description')}>
            <p className="whitespace-pre-wrap text-sm">{task.description}</p>
          </Card>
        )}
        <Grid cols={2}>
          <Card title={t('tasks.assignees')}>
            <ul className="space-y-2 text-sm">
              {task.assignees.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between">
                  <span>{a.full_name}</span>
                  {canManage && (
                    <form action={unassignTask}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="user_id" value={a.id} />
                      <button className="text-xs text-danger">{t('common.delete')}</button>
                    </form>
                  )}
                </li>
              ))}
              {task.assignees.length === 0 && <li className="text-muted">{t('common.none')}</li>}
            </ul>
            {canManage && members.length > 0 && (
              <form action={assignTask} className="mt-4 flex gap-2">
                <input type="hidden" name="id" value={id} />
                <Select name="user_id" options={members.map((m: any) => ({ value: m.id, label: m.full_name }))} />
                <Button variant="secondary">{t('tasks.assign')}</Button>
              </form>
            )}
          </Card>
          {canManage && (
            <Card title={t('tasks.change_status')}>
              <form action={updateTask} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="version" value={task.version} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('common.status')}>
                    <Select name="status" defaultValue={task.status} options={['new', 'in_progress', 'done', 'cancelled'].map((s) => ({ value: s, label: t(`tasks.status.${s}` as any) }))} />
                  </Field>
                  <Field label={t('tasks.priority')}>
                    <Select name="priority" defaultValue={task.priority} options={['low', 'normal', 'high', 'critical'].map((p) => ({ value: p, label: t(`tasks.priority.${p}` as any) }))} />
                  </Field>
                </div>
                <Field label={t('tasks.deadline')}>
                  <Input type="datetime-local" name="deadline" defaultValue={toLocal(task.deadline)} />
                </Field>
                <Button>{t('common.save')}</Button>
              </form>
            </Card>
          )}
        </Grid>
        <p className="text-xs text-muted">
          {t('tasks.created_by')}: {task.created_by_name} · {fmtDate(task.created_at, true)} · {t('common.version')} {task.version}
          {task.completed_at && ` · ${t('tasks.completed_at')}: ${fmtDate(task.completed_at, true)}`}
        </p>
      </div>
    </>
  );
}

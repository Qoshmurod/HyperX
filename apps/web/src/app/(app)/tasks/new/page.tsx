import { ErrorNotice } from '@/components/error-notice';
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { createTask } from '../actions';

export default async function NewTask({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { t, lx } = await getT();
  const sp = await searchParams;
  const orgs = await api('/organizations');
  return (
    <>
      <PageHeader title={t('tasks.new')} />
      <ErrorNotice code={sp.error} />
      <Card className="max-w-2xl">
        <form action={createTask} className="space-y-4">
          <Field label={t('common.organization')}>
            <Select name="organization_id" required options={orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }))} />
          </Field>
          <Field label={t('tasks.task_title')}>
            <Input name="title" required minLength={3} maxLength={500} />
          </Field>
          <Field label={t('common.description')}>
            <Textarea name="description" maxLength={20000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('tasks.priority')}>
              <Select name="priority" defaultValue="normal" options={['low', 'normal', 'high', 'critical'].map((p) => ({ value: p, label: t(`tasks.priority.${p}` as any) }))} />
            </Field>
            <Field label={t('common.classification')}>
              <Select name="classification" defaultValue="internal" options={['public', 'internal', 'confidential', 'secret'].map((c) => ({ value: c, label: t(`classification.${c}` as any) }))} />
            </Field>
            <Field label={t('tasks.deadline')}>
              <Input type="datetime-local" name="deadline" />
            </Field>
          </div>
          <Button type="submit">{t('common.create')}</Button>
        </form>
      </Card>
    </>
  );
}

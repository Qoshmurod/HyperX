import { ErrorNotice } from '@/components/error-notice';
import { Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { createDecision } from '../actions';

export default async function NewDecision({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { t, lx } = await getT();
  const sp = await searchParams;
  const orgs = await api('/organizations');
  return (
    <>
      <PageHeader title={t('decisions.new')} />
      <ErrorNotice code={sp.error} />
      <Card className="max-w-2xl">
        <form action={createDecision} className="space-y-4">
          <Notice>{t('decisions.human_note')}</Notice>
          <Field label={t('common.organization')}>
            <Select name="organization_id" options={orgs.map((o: any) => ({ value: o.id, label: lx(o.name) }))} />
          </Field>
          <Field label={t('common.name')}>
            <Input name="title" required minLength={3} />
          </Field>
          <Field label={t('decisions.problem')}>
            <Textarea name="problem" required minLength={10} rows={6} />
          </Field>
          <Field label={t('common.classification')}>
            <Select name="classification" defaultValue="internal" options={['public', 'internal', 'confidential'].map((c) => ({ value: c, label: t(`classification.${c}` as any) }))} />
          </Field>
          <Button>{t('common.create')}</Button>
        </form>
      </Card>
    </>
  );
}

import { ErrorNotice } from '@/components/error-notice';
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { getT } from '@/lib/i18n';
import { openNotification, readAll, savePrefs } from './actions';

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { t, fmtDate } = await getT();
  const sp = await searchParams;
  const [n, prefs] = await Promise.all([api('/notifications'), api('/notifications/preferences')]);
  const tone = (s: string) => (s === 'critical' ? 'danger' : s === 'warning' ? 'warn' : 'neutral');
  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        actions={
          n.unread > 0 && (
            <form action={readAll}>
              <Button variant="secondary">{t('notifications.mark_all')}</Button>
            </form>
          )
        }
      />
      <ErrorNotice code={sp.error} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          {n.items.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('notifications.empty')}</p>}
          <ul className="divide-y divide-border">
            {n.items.map((x: any) => (
              <li key={x.id} className="py-3">
                <form action={openNotification} className="flex items-start justify-between gap-3">
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="link" value={x.link ?? '/notifications'} />
                  <button className={`text-left text-sm ${x.read_at ? 'text-muted' : 'font-medium'}`}>
                    {x.title}
                    {x.body && <span className="block text-xs text-muted">{x.body}</span>}
                  </button>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={tone(x.severity)}>{t(`severity.${x.severity}` as any)}</Badge>
                    <span className="text-xs text-muted">{fmtDate(x.created_at, true)}</span>
                  </span>
                </form>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t('notifications.preferences')}>
          {sp.saved && <div className="mb-3"><Notice tone="ok">{t('common.save')} ✓</Notice></div>}
          <form action={savePrefs} className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="email_enabled" defaultChecked={prefs.email_enabled} /> {t('notifications.email')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="telegram_enabled" defaultChecked={prefs.telegram_enabled} /> {t('notifications.telegram')}
            </label>
            <Field label={t('notifications.telegram_chat')}>
              <Input name="telegram_chat_id" defaultValue={prefs.telegram_chat_id ?? ''} pattern="-?\d{3,20}" />
            </Field>
            <Field label={t('notifications.min_severity')}>
              <Select name="min_severity" defaultValue={prefs.min_severity} options={['info', 'warning', 'critical'].map((s) => ({ value: s, label: t(`severity.${s}` as any) }))} />
            </Field>
            <Button>{t('common.save')}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

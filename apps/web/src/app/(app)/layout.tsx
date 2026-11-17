import { t } from '@govmind/i18n';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { api, ApiError, getMe } from '@/lib/api';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  let me;
  try {
    me = await getMe();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) redirect('/login?error=not_registered');
    throw e;
  }
  const notif = await api<{ unread: number }>('/notifications?unread=true').catch(() => ({ unread: 0 }));
  const roles = [...new Set(me.grants.map((g) => t(locale, `role.${g.role}` as any)))].join(', ');
  return (
    <Shell locale={locale} permissions={me.permissions} userName={me.full_name} roles={roles} unread={notif.unread}>
      {children}
    </Shell>
  );
}

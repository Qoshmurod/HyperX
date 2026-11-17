'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { failBack, str } from '@/lib/form';

export async function readAll() {
  await api('/notifications/read-all', { method: 'POST' });
  redirect('/notifications');
}

export async function openNotification(fd: FormData) {
  const id = str(fd, 'id')!;
  await api(`/notifications/${id}/read`, { method: 'POST' });
  redirect(str(fd, 'link') ?? '/notifications');
}

export async function savePrefs(fd: FormData) {
  try {
    await api('/notifications/preferences', {
      method: 'PUT',
      json: {
        email_enabled: fd.get('email_enabled') === 'on',
        telegram_enabled: fd.get('telegram_enabled') === 'on',
        telegram_chat_id: str(fd, 'telegram_chat_id') ?? null,
        min_severity: str(fd, 'min_severity') ?? 'info',
      },
    });
  } catch (e) {
    failBack('/notifications', e);
  }
  redirect('/notifications?saved=1');
}

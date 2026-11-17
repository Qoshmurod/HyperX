'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { failBack, str } from '@/lib/form';

export async function resolveConflict(fd: FormData) {
  try {
    await api(`/sync/conflicts/${str(fd, 'id')}/resolve`, { method: 'POST', json: { resolution: str(fd, 'resolution'), note: str(fd, 'note') } });
  } catch (e) {
    failBack('/sync', e);
  }
  redirect('/sync');
}

export async function registerNode(fd: FormData) {
  let token: string;
  try {
    const r = await api('/sync/nodes', {
      method: 'POST',
      json: { node_id: str(fd, 'node_id'), level: str(fd, 'level'), administrative_unit_id: str(fd, 'administrative_unit_id') },
    });
    token = r.token;
  } catch (e) {
    failBack('/sync', e);
  }
  // Token faqat bir marta, sahifada ko'rsatiladi (URL'ga yozilmaydi — fragment server jurnaliga tushmaydi).
  redirect(`/sync?registered=1#token=${encodeURIComponent(token)}`);
}

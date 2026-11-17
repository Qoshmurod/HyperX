'use server';

import { redirect } from 'next/navigation';
import { config } from '@/lib/config';
import { getSession } from '@/lib/api';
import { failBack, str } from '@/lib/form';
import { ApiError } from '@/lib/api';

export async function uploadDocument(fd: FormData) {
  try {
    const s = await getSession();
    if (!s) redirect('/login');
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new ApiError(400, {});
    const body = new FormData();
    body.set('organization_id', str(fd, 'organization_id') ?? '');
    body.set('title', str(fd, 'title') ?? file.name);
    body.set('classification', str(fd, 'classification') ?? 'internal');
    body.set('file', file, file.name);
    const res = await fetch(`${config.apiUrl}/api/v1/documents`, { method: 'POST', headers: { Authorization: `Bearer ${s.at}` }, body });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
  } catch (e) {
    failBack('/documents', e);
  }
  redirect('/documents');
}

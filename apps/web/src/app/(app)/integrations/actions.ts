'use server';

import { redirect } from 'next/navigation';
import { ApiError, api, getSession } from '@/lib/api';
import { config } from '@/lib/config';
import { failBack, str } from '@/lib/form';

export async function createClient(fd: FormData) {
  let key: string;
  try {
    const r = await api('/integrations/clients', {
      method: 'POST',
      json: { organization_id: str(fd, 'organization_id'), name: str(fd, 'name'), permissions: fd.getAll('permissions'), max_classification: str(fd, 'max_classification') },
    });
    key = r.api_key;
  } catch (e) {
    failBack('/integrations', e);
  }
  redirect(`/integrations?created=1#secret=${encodeURIComponent(key)}`);
}

export async function revokeClient(fd: FormData) {
  try {
    await api(`/integrations/clients/${str(fd, 'id')}`, { method: 'DELETE' });
  } catch (e) {
    failBack('/integrations', e);
  }
  redirect('/integrations');
}

export async function createWebhook(fd: FormData) {
  let secret: string;
  try {
    const r = await api('/integrations/webhooks', {
      method: 'POST',
      json: { organization_id: str(fd, 'organization_id'), url: str(fd, 'url'), events: fd.getAll('events') },
    });
    secret = r.signing_secret;
  } catch (e) {
    failBack('/integrations', e);
  }
  redirect(`/integrations?created=1#secret=${encodeURIComponent(secret)}`);
}

export async function disableWebhook(fd: FormData) {
  try {
    await api(`/integrations/webhooks/${str(fd, 'id')}`, { method: 'DELETE' });
  } catch (e) {
    failBack('/integrations', e);
  }
  redirect('/integrations');
}

export async function importFile(fd: FormData) {
  let result: any;
  try {
    const s = await getSession();
    if (!s) redirect('/login');
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new ApiError(400, {});
    const body = new FormData();
    body.set('file', file, file.name);
    const kind = str(fd, 'kind') === 'kpi_measurements' ? 'kpi_measurements' : 'tasks';
    const res = await fetch(`${config.apiUrl}/api/v1/integrations/import/${kind}?organization_id=${encodeURIComponent(str(fd, 'organization_id') ?? '')}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.at}` },
      body,
    });
    result = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, result);
  } catch (e) {
    failBack('/integrations', e);
  }
  redirect(`/integrations?imported=${result.succeeded}&failed=${result.failed}`);
}

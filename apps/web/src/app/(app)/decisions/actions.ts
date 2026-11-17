'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { failBack, str } from '@/lib/form';

export async function createDecision(fd: FormData) {
  let id: string;
  try {
    const d = await api('/decisions', {
      method: 'POST',
      json: { organization_id: str(fd, 'organization_id'), title: str(fd, 'title'), problem: str(fd, 'problem'), classification: str(fd, 'classification') },
    });
    id = d.id;
  } catch (e) {
    failBack('/decisions/new', e);
  }
  redirect(`/decisions/${id}`);
}

export async function reviewDecision(fd: FormData) {
  const id = str(fd, 'id')!;
  const action = str(fd, 'action');
  try {
    if (action === 'submit') {
      await api(`/decisions/${id}/submit`, { method: 'POST', json: { version: Number(fd.get('version')) } });
    } else {
      const opt = str(fd, 'selected_option');
      await api(`/decisions/${id}/${action === 'approve' ? 'approve' : 'reject'}`, {
        method: 'POST',
        json: { note: str(fd, 'note'), version: Number(fd.get('version')), ...(opt !== undefined ? { selected_option: Number(opt) } : {}) },
      });
    }
  } catch (e) {
    failBack(`/decisions/${id}`, e);
  }
  redirect(`/decisions/${id}`);
}

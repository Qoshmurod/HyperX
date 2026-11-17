'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { failBack, str } from '@/lib/form';

export async function generateReport(fd: FormData) {
  let id: string;
  try {
    const r = await api('/reports/generate', {
      method: 'POST',
      json: {
        organization_id: str(fd, 'organization_id'),
        report_type: str(fd, 'report_type'),
        period_start: str(fd, 'period_start'),
        period_end: str(fd, 'period_end'),
        with_ai_commentary: fd.get('with_ai') === 'on',
      },
    });
    id = r.id;
  } catch (e) {
    failBack('/reports', e);
  }
  redirect(`/reports/${id}`);
}

export async function transitionReport(fd: FormData) {
  const id = str(fd, 'id')!;
  const to = str(fd, 'to') === 'approve' ? 'approve' : 'submit';
  try {
    await api(`/reports/${id}/${to}`, { method: 'POST', json: { version: Number(fd.get('version')) } });
  } catch (e) {
    failBack(`/reports/${id}`, e);
  }
  redirect(`/reports/${id}`);
}

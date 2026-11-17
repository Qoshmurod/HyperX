'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { failBack, str } from '@/lib/form';

export async function createKpi(fd: FormData) {
  let id: string;
  try {
    const k = await api('/kpi/definitions', {
      method: 'POST',
      json: {
        organization_id: str(fd, 'organization_id'), code: str(fd, 'code'), name: str(fd, 'name'), unit: str(fd, 'unit'),
        direction: str(fd, 'direction'), period: str(fd, 'period'),
      },
    });
    id = k.id;
  } catch (e) {
    failBack('/kpi', e);
  }
  redirect(`/kpi/${id}`);
}

const num = (v: string | undefined) => (v === undefined ? null : Number(v.replace(',', '.')));

export async function recordValue(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/kpi/definitions/${id}/measurements`, {
      method: 'POST',
      json: { period_start: str(fd, 'period_start'), planned_value: num(str(fd, 'planned_value')), actual_value: num(str(fd, 'actual_value')), source: str(fd, 'source') },
    });
  } catch (e) {
    failBack(`/kpi/${id}`, e);
  }
  redirect(`/kpi/${id}`);
}

export async function runForecast(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    const change = str(fd, 'change_pct');
    await api('/ai/forecast', {
      method: 'POST',
      json: { kpi_definition_id: id, horizon: Number(str(fd, 'horizon') ?? 6), ...(change ? { scenario: { change_pct: Number(change) } } : {}) },
    });
  } catch (e) {
    failBack(`/kpi/${id}`, e);
  }
  redirect(`/kpi/${id}#forecast`);
}

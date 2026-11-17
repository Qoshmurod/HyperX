'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { failBack, str } from '@/lib/form';

export async function createUnit(fd: FormData) {
  try {
    await api('/administrative-units', {
      method: 'POST',
      json: { parent_id: str(fd, 'parent_id'), level: str(fd, 'level'), name: str(fd, 'name'), code: str(fd, 'code'), slug: str(fd, 'slug') },
    });
  } catch (e) {
    failBack('/organizations', e);
  }
  redirect('/organizations');
}

export async function createOrganization(fd: FormData) {
  let id: string;
  try {
    const o = await api('/organizations', {
      method: 'POST',
      json: { administrative_unit_id: str(fd, 'administrative_unit_id'), name: str(fd, 'name'), code: str(fd, 'code'), organization_type: str(fd, 'organization_type') },
    });
    id = o.id;
  } catch (e) {
    failBack('/organizations', e);
  }
  redirect(`/organizations/${id}`);
}

export async function updateOrganization(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/organizations/${id}`, { method: 'PATCH', json: { name: str(fd, 'name'), status: str(fd, 'status'), version: Number(fd.get('version')) } });
  } catch (e) {
    failBack(`/organizations/${id}`, e);
  }
  redirect(`/organizations/${id}`);
}

export async function createDepartment(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/organizations/${id}/departments`, { method: 'POST', json: { name: str(fd, 'name') } });
  } catch (e) {
    failBack(`/organizations/${id}`, e);
  }
  redirect(`/organizations/${id}`);
}

'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { failBack, str } from '@/lib/form';

export async function createUser(fd: FormData) {
  let id: string;
  try {
    const u = await api('/users', {
      method: 'POST',
      json: { username: str(fd, 'username'), full_name: str(fd, 'full_name'), email: str(fd, 'email'), organization_id: str(fd, 'organization_id'), position: str(fd, 'position') },
    });
    id = u.id;
  } catch (e) {
    failBack('/users', e);
  }
  redirect(`/users/${id}`);
}

export async function setStatus(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/users/${id}`, { method: 'PATCH', json: { status: str(fd, 'status') } });
  } catch (e) {
    failBack(`/users/${id}`, e);
  }
  redirect(`/users/${id}`);
}

export async function grantRole(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    const until = str(fd, 'valid_until');
    await api(`/users/${id}/roles`, {
      method: 'POST',
      json: {
        role_code: str(fd, 'role_code'), administrative_unit_id: str(fd, 'administrative_unit_id'), max_classification: str(fd, 'max_classification'),
        ...(until ? { valid_until: new Date(`${until}T23:59:59+05:00`).toISOString() } : {}),
      },
    });
  } catch (e) {
    failBack(`/users/${id}`, e);
  }
  redirect(`/users/${id}`);
}

export async function revokeRole(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/users/${id}/roles/${str(fd, 'grant_id')}`, { method: 'DELETE' });
  } catch (e) {
    failBack(`/users/${id}`, e);
  }
  redirect(`/users/${id}`);
}

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';
import { failBack, localToIso, str } from '@/lib/form';

export async function createTask(fd: FormData) {
  let id: string;
  try {
    const assignee = str(fd, 'assignee_id');
    const t = await api('/tasks', {
      method: 'POST',
      json: {
        organization_id: str(fd, 'organization_id'),
        title: str(fd, 'title'),
        description: str(fd, 'description'),
        priority: str(fd, 'priority'),
        classification: str(fd, 'classification'),
        deadline: localToIso(str(fd, 'deadline')),
        assignee_ids: assignee ? [assignee] : [],
      },
    });
    id = t.id;
  } catch (e) {
    failBack('/tasks/new', e);
  }
  redirect(`/tasks/${id}`);
}

export async function updateTask(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/tasks/${id}`, {
      method: 'PATCH',
      json: { status: str(fd, 'status'), priority: str(fd, 'priority'), deadline: localToIso(str(fd, 'deadline')), version: Number(fd.get('version')) },
    });
  } catch (e) {
    failBack(`/tasks/${id}`, e);
  }
  revalidatePath(`/tasks/${id}`);
  redirect(`/tasks/${id}`);
}

export async function assignTask(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/tasks/${id}/assignees`, { method: 'POST', json: { user_id: str(fd, 'user_id'), role: str(fd, 'role') ?? 'responsible' } });
  } catch (e) {
    failBack(`/tasks/${id}`, e);
  }
  redirect(`/tasks/${id}`);
}

export async function unassignTask(fd: FormData) {
  const id = str(fd, 'id')!;
  try {
    await api(`/tasks/${id}/assignees/${str(fd, 'user_id')}`, { method: 'DELETE' });
  } catch (e) {
    failBack(`/tasks/${id}`, e);
  }
  redirect(`/tasks/${id}`);
}

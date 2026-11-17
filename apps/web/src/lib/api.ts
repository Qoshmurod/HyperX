import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { config } from './config';
import { getLocale } from './i18n';
import { readSealed, unseal, Session } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(typeof body?.message === 'string' ? body.message : `API error ${status}`);
  }
}

export const getSession = cache(async (): Promise<Session | null> => unseal(readSealed(await cookies())));

async function authHeaders(): Promise<Record<string, string>> {
  const s = await getSession();
  if (!s) redirect('/login');
  return { Authorization: `Bearer ${s.at}`, 'X-Lang': await getLocale() };
}

/** Server tomonida API chaqiruvi. Token hech qachon brauzerga chiqmaydi. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()), ...((init.headers as Record<string, string>) ?? {}) };
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${config.apiUrl}/api/v1${path}`, { ...init, headers, body, cache: 'no-store' });
  if (res.status === 401) redirect('/login?expired=1');
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Fayl yuklab olish uchun xom javob. */
export async function apiRaw(path: string): Promise<Response> {
  return fetch(`${config.apiUrl}/api/v1${path}`, { headers: await authHeaders(), cache: 'no-store' });
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { message: t };
  }
}

export interface Me {
  id: string;
  username: string;
  full_name: string;
  permissions: string[];
  grants: { role: string; scope_path: string; max_classification: string; valid_until: string | null }[];
  units: { id: string; name: string; level: string; path: string }[];
}

export const getMe = cache(async (): Promise<Me> => api<Me>('/auth/me'));

export async function can(permission: string): Promise<boolean> {
  return (await getMe()).permissions.includes(permission);
}

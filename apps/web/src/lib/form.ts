import 'server-only';
import type { MessageKey } from '@govmind/i18n';
import { redirect } from 'next/navigation';
import { ApiError } from './api';

/** API xatosini foydalanuvchiga ko'rinadigan xabar kalitiga aylantirib, sahifaga qaytaradi. */
export function failBack(path: string, e: unknown): never {
  if (e && typeof e === 'object' && 'digest' in e && String((e as any).digest).startsWith('NEXT_REDIRECT')) throw e;
  let code = 'error';
  if (e instanceof ApiError) {
    code = e.status === 403 ? 'forbidden' : e.status === 404 ? 'not_found' : e.status === 409 ? 'conflict' : e.status === 400 ? 'invalid' : 'error';
  }
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}error=${code}`);
}

export function errorKey(code?: string): MessageKey | null {
  if (!code) return null;
  return (
    { forbidden: 'common.forbidden', not_found: 'common.not_found', conflict: 'common.conflict', invalid: 'common.error', error: 'common.error' } as const
  )[code as 'error'] ?? 'common.error';
}

export function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** `<input type="datetime-local">` qiymatini Toshkent vaqti bilan ISO qatoriga aylantiradi. */
export function localToIso(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.length === 16 ? `${v}:00+05:00` : v;
}

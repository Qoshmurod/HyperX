'use server';

import { isLocale } from '@govmind/i18n';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE } from './i18n';

export async function setLocale(formData: FormData) {
  const v = formData.get('locale');
  if (isLocale(v)) {
    (await cookies()).set(LOCALE_COOKIE, v, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: false });
  }
  revalidatePath('/', 'layout');
}

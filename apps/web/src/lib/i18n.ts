import 'server-only';
import { DEFAULT_LOCALE, intlLocale, isLocale, Locale, localizeText, MessageKey, t as translate } from '@govmind/i18n';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

export const LOCALE_COOKIE = 'gm_lang';

export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get('accept-language') ?? '';
  if (/^ru/i.test(accept)) return 'ru';
  if (/^en/i.test(accept)) return 'en';
  return DEFAULT_LOCALE;
});

export async function getT() {
  const locale = await getLocale();
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const lx = (text: string | null | undefined) => localizeText(locale, text);
  const fmtDate = (v: string | Date | null | undefined, withTime = false) => {
    if (!v) return '—';
    const d = typeof v === 'string' ? new Date(v) : v;
    return new Intl.DateTimeFormat(intlLocale(locale), {
      year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      timeZone: 'Asia/Tashkent',
    }).format(d);
  };
  const fmtNum = (v: number | string | null | undefined, digits = 1) =>
    v === null || v === undefined || v === '' ? '—' : new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(Number(v));
  return { t, lx, locale, fmtDate, fmtNum };
}

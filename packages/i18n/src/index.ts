import { en } from './messages.en';
import { ru } from './messages.ru';
import { MessageKey, uz } from './messages.uz';
import { latinToCyrillic } from './translit';

export { latinToCyrillic } from './translit';
export type { MessageKey } from './messages.uz';

export const LOCALES = ['uz', 'uz-Cyrl', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uz';

export type Messages = Record<MessageKey, string>;

const cyrillic: Messages = Object.fromEntries(
  Object.entries(uz).map(([k, v]) => [k, k.startsWith('lang.') ? v : latinToCyrillic(v)]),
) as Messages;

const DICTIONARIES: Record<Locale, Messages> = { uz, 'uz-Cyrl': cyrillic, ru, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function messages(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? uz;
}

/** `t(locale, 'key', { name: 'x' })` — `{name}` o'rniga qiymat qo'yiladi. */
export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = messages(locale)[key] ?? uz[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Ma'lumotlar bazasidagi lotin yozuvidagi matnni (masalan tashkilot nomi) tanlangan yozuvga moslash. */
export function localizeText(locale: Locale, text: string | null | undefined): string {
  if (!text) return '';
  return locale === 'uz-Cyrl' ? latinToCyrillic(text) : text;
}

/** HTML `lang` atributi va Intl uchun. */
export function htmlLang(locale: Locale): string {
  return locale === 'uz-Cyrl' ? 'uz-Cyrl' : locale === 'uz' ? 'uz-Latn' : locale;
}

export function intlLocale(locale: Locale): string {
  return { uz: 'uz-Latn-UZ', 'uz-Cyrl': 'uz-Cyrl-UZ', ru: 'ru-RU', en: 'en-GB' }[locale];
}

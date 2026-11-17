import { LOCALES, Locale, t } from '@govmind/i18n';
import { setLocale } from '@/lib/actions';
import { cx } from './ui';

export function LangSwitcher({ current }: { current: Locale }) {
  return (
    <form action={setLocale} className="flex flex-wrap gap-1" aria-label="Til / Язык / Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          className={cx('rounded px-2 py-1 text-xs', l === current ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2')}
          aria-pressed={l === current}
        >
          {t(l, `lang.${l}`)}
        </button>
      ))}
    </form>
  );
}

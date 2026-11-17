import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx('rounded-lg border border-border bg-surface p-4', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'danger' && 'text-danger')}>
        {value}
      </div>
    </div>
  );
}

const buttonBase = 'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50';
const variants = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-border bg-surface hover:bg-surface-2',
  danger: 'border border-danger text-danger hover:bg-surface-2',
  ghost: 'hover:bg-surface-2',
};

export function Button({ variant = 'primary', className, ...p }: ComponentProps<'button'> & { variant?: keyof typeof variants }) {
  return <button className={cx(buttonBase, variants[variant], className)} {...p} />;
}

export function LinkButton({ variant = 'primary', className, ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link className={cx(buttonBase, variants[variant], className)} {...p} />;
}

const field = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted';

export function Input(p: ComponentProps<'input'>) {
  return <input {...p} className={cx(field, p.className)} />;
}

export function Textarea(p: ComponentProps<'textarea'>) {
  return <textarea {...p} className={cx(field, 'min-h-24', p.className)} />;
}

export function Select({ options, ...p }: ComponentProps<'select'> & { options: { value: string; label: string }[] }) {
  return (
    <select {...p} className={cx(field, p.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const badgeTones = {
  neutral: 'bg-surface-2 text-muted',
  ok: 'bg-surface-2 text-ok',
  warn: 'bg-surface-2 text-warn',
  danger: 'bg-surface-2 text-danger',
  accent: 'bg-surface-2 text-accent',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={cx('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', badgeTones[tone])}>{children}</span>;
}

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: 'right';
}

export function Table<T extends Record<string, any>>({ columns, rows, empty, rowKey }: { columns: Column<T>[]; rows: T[]; empty: string; rowKey?: (r: T, i: number) => string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            {columns.map((c) => (
              <th key={c.key} className={cx('px-2 py-2 font-medium', c.align === 'right' && 'text-right')}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey ? rowKey(r, i) : (r.id ?? i)} className="border-b border-border last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={cx('px-2 py-2 align-top', c.align === 'right' && 'text-right tabular-nums')}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'danger' | 'ok' }) {
  return (
    <div
      className={cx(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'neutral' && 'border-border bg-surface-2 text-muted',
        tone === 'warn' && 'border-warn text-warn',
        tone === 'danger' && 'border-danger text-danger',
        tone === 'ok' && 'border-ok text-ok',
      )}
    >
      {children}
    </div>
  );
}

export function Grid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cx('grid gap-3', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3', cols === 4 && 'grid-cols-2 lg:grid-cols-4')}>
      {children}
    </div>
  );
}

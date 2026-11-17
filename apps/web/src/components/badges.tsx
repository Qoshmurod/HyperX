import type { Locale } from '@govmind/i18n';
import { t } from '@govmind/i18n';
import { Badge } from './ui';

export function StatusBadge({ status, overdue, locale }: { status: string; overdue?: boolean; locale: Locale }) {
  const tone = status === 'done' ? 'ok' : status === 'cancelled' ? 'neutral' : overdue ? 'danger' : 'accent';
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={tone}>{t(locale, `tasks.status.${status}` as any)}</Badge>
      {overdue && <Badge tone="danger">{t(locale, 'tasks.overdue')}</Badge>}
    </span>
  );
}

export function PriorityBadge({ priority, locale }: { priority: string; locale: Locale }) {
  const tone = priority === 'critical' ? 'danger' : priority === 'high' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{t(locale, `tasks.priority.${priority}` as any)}</Badge>;
}

export function ClassBadge({ value, locale }: { value: string; locale: Locale }) {
  const tone = value === 'secret' || value === 'confidential' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{t(locale, `classification.${value}` as any)}</Badge>;
}

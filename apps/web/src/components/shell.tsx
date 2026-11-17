import type { Locale, MessageKey } from '@govmind/i18n';
import { t } from '@govmind/i18n';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './logo';
import { LangSwitcher } from './lang-switcher';

interface NavItem {
  href: string;
  key: MessageKey;
  permission?: string;
}

const NAV: NavItem[] = [
  { href: '/', key: 'nav.dashboard', permission: 'tasks.read' },
  { href: '/tasks', key: 'nav.tasks', permission: 'tasks.read' },
  { href: '/kpi', key: 'nav.kpi', permission: 'kpi.read' },
  { href: '/reports', key: 'nav.reports', permission: 'reports.read' },
  { href: '/ai', key: 'nav.ai', permission: 'ai.use' },
  { href: '/decisions', key: 'nav.decisions', permission: 'decisions.create' },
  { href: '/documents', key: 'nav.documents', permission: 'documents.read' },
  { href: '/organizations', key: 'nav.organizations', permission: 'organizations.read' },
  { href: '/users', key: 'nav.users', permission: 'users.manage' },
  { href: '/notifications', key: 'nav.notifications' },
  { href: '/audit', key: 'nav.audit', permission: 'audit.read' },
  { href: '/sync', key: 'nav.sync', permission: 'sync.resolve' },
  { href: '/integrations', key: 'nav.integrations', permission: 'integrations.manage' },
];

export function Shell({
  children,
  locale,
  permissions,
  userName,
  roles,
  unread,
}: {
  children: ReactNode;
  locale: Locale;
  permissions: string[];
  userName: string;
  roles: string;
  unread: number;
}) {
  const items = NAV.filter((n) => !n.permission || permissions.includes(n.permission));
  const nav = (
    <nav className="space-y-0.5">
      {items.map((n) => (
        <Link key={n.href} href={n.href} className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-surface-2">
          <span>{t(locale, n.key)}</span>
          {n.href === '/notifications' && unread > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-xs text-accent-fg">{unread}</span>
          )}
        </Link>
      ))}
    </nav>
  );
  const footer = (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="px-3 text-sm">
        <div className="font-medium">{userName}</div>
        <div className="text-xs text-muted">{roles}</div>
      </div>
      <div className="px-2">
        <LangSwitcher current={locale} />
      </div>
      <form action="/auth/logout" method="post" className="px-3">
        <button className="text-sm text-muted hover:text-fg">{t(locale, 'auth.logout')}</button>
      </form>
    </div>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border bg-surface p-3 lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div className="space-y-4 overflow-y-auto">
          <Link href="/" className="flex items-center gap-2 px-2 py-1">
            <Logo />
            <span className="font-semibold">GovMind AI</span>
          </Link>
          {nav}
        </div>
        {footer}
      </aside>
      <details className="border-b border-border bg-surface lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 font-semibold">
            <Logo /> GovMind AI
          </span>
          <span className="text-sm text-muted">☰</span>
        </summary>
        <div className="space-y-3 px-2 pb-3">
          {nav}
          {footer}
        </div>
      </details>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}

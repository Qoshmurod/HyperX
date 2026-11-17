import { LangSwitcher } from '@/components/lang-switcher';
import { LinkButton, Notice } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Login' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; expired?: string }> }) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <div>
            <div className="text-lg font-semibold">{t('app.name')}</div>
            <div className="text-xs text-muted">{t('app.tagline')}</div>
          </div>
        </div>
        <div className="space-y-4">
          {sp.error === 'not_registered' && <Notice tone="danger">{t('auth.not_registered')}</Notice>}
          {sp.error === 'idp' && <Notice tone="danger">{t('auth.idp_unavailable')}</Notice>}
          {sp.error === 'api' && <Notice tone="danger">{t('auth.api_unavailable')}</Notice>}
          {sp.error && !['not_registered', 'idp', 'api'].includes(sp.error) && <Notice tone="danger">{t('auth.login_failed')}</Notice>}
          {sp.expired && <Notice tone="warn">{t('auth.session_expired')}</Notice>}
          <p className="text-sm text-muted">{t('auth.login_hint')}</p>
          <LinkButton href="/auth/login" prefetch={false} className="w-full">
            {t('auth.login')}
          </LinkButton>
        </div>
      </div>
      <div className="mt-4 flex justify-center">
        <LangSwitcher current={locale} />
      </div>
    </main>
  );
}

import { htmlLang } from '@govmind/i18n';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getLocale } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'GovMind AI', template: '%s · GovMind AI' },
  description: "Davlat boshqaruvi uchun tahlil va qarorlarni qo'llab-quvvatlash platformasi",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={htmlLang(locale)}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

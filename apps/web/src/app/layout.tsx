import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'GovMind AI',
  description: 'Davlat boshqaruvi uchun tahlil va qarorlarni qo‘llab-quvvatlash platformasi',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}

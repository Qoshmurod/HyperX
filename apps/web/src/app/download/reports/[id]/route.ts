import { NextRequest } from 'next/server';
import { proxyDownload } from '@/lib/download';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams;
  return proxyDownload(`/reports/${encodeURIComponent(id)}/export?format=${encodeURIComponent(q.get('format') ?? 'pdf')}&lang=${encodeURIComponent(q.get('lang') ?? 'uz')}`);
}

import { NextRequest } from 'next/server';
import { proxyDownload } from '@/lib/download';

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';
  return proxyDownload(`/integrations/export/tasks?format=${encodeURIComponent(format)}`);
}

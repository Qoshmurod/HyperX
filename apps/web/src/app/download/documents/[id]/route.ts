import { proxyDownload } from '@/lib/download';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyDownload(`/documents/${encodeURIComponent(id)}/download`);
}

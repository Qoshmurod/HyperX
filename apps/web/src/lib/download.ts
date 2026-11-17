import 'server-only';
import { NextResponse } from 'next/server';
import { apiRaw } from './api';

/** API faylini brauzerga uzatish (token serverda qoladi). */
export async function proxyDownload(path: string): Promise<NextResponse> {
  const res = await apiRaw(path);
  if (!res.ok) return new NextResponse('Error', { status: res.status });
  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('cache-control', 'no-store');
  return new NextResponse(res.body, { status: 200, headers });
}

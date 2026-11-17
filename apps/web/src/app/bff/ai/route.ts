import { NextRequest, NextResponse } from 'next/server';
import { api, ApiError } from '@/lib/api';

/** Brauzerdagi chat komponenti uchun BFF: token serverda qoladi. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.slice(0, 4000) : '';
  const conversation_id = typeof body.conversation_id === 'string' ? body.conversation_id : undefined;
  try {
    return NextResponse.json(await api('/ai/chat', { method: 'POST', json: { message, conversation_id } }));
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return NextResponse.json({ error: status }, { status });
  }
}

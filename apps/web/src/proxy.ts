import { NextRequest, NextResponse } from 'next/server';
import { refresh } from '@/lib/oidc';
import { readSealed, seal, unseal, writeSealed } from '@/lib/session';

const PUBLIC = [/^\/login/, /^\/auth\//, /^\/_next\//, /^\/favicon/, /^\/healthz/];

/** Har bir so'rovda sessiyani tekshiradi; tokenning muddati tugayotgan bo'lsa yangilaydi. */
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((r) => r.test(path))) return NextResponse.next();

  const session = await unseal(readSealed(req.cookies));
  if (!session) return NextResponse.redirect(new URL('/login', req.url));

  if (session.exp - 60 > Math.floor(Date.now() / 1000)) return NextResponse.next();

  const renewed = await refresh(session);
  if (!renewed) return NextResponse.redirect(new URL('/login?expired=1', req.url));
  const sealed = await seal(renewed);
  // Yangilangan cookie joriy so'rovga ham, javobga ham yoziladi.
  writeSealed({ set: (n, v) => req.cookies.set(n, v), delete: (n) => req.cookies.delete(n) }, sealed);
  const res = NextResponse.next({ request: { headers: req.headers } });
  writeSealed({ set: (n, v, o) => res.cookies.set(n, v, o), delete: (n) => res.cookies.delete(n) }, sealed);
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

import * as client from 'openid-client';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { oidc, toSession } from '@/lib/oidc';
import { clearSession, seal, unseal, writeSealed } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const pending = await unseal(jar.get('gm_oidc')?.value);
  jar.delete('gm_oidc');
  if (!pending?.name) return NextResponse.redirect(`${config.baseUrl}/login?error=state`);
  const { verifier, state, nonce } = JSON.parse(pending.name);

  let session;
  try {
    // Teskari proksi ortida ham to'g'ri redirect_uri bo'lishi uchun tashqi manzil ishlatiladi.
    const current = new URL(`${config.baseUrl}${req.nextUrl.pathname}${req.nextUrl.search}`);
    const tokens = await client.authorizationCodeGrant(await oidc(), current, {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
    });
    session = toSession(tokens);
  } catch {
    return NextResponse.redirect(`${config.baseUrl}/login?error=callback`);
  }

  // GovMind'da ro'yxatdan o'tganini tekshirish va kirishni auditga yozish.
  const ua = (await headers()).get('user-agent') ?? '';
  const res = await fetch(`${config.apiUrl}/api/v1/auth/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'login', user_agent: ua.slice(0, 500) }),
  }).catch(() => null);
  if (!res || res.status === 403) {
    clearSession(jar);
    return NextResponse.redirect(`${config.baseUrl}/login?error=not_registered`);
  }

  writeSealed(jar, await seal(session));
  return NextResponse.redirect(`${config.baseUrl}/`);
}

import * as client from 'openid-client';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { oidc } from '@/lib/oidc';
import { clearSession, readSealed, unseal } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const jar = await cookies();
  const s = await unseal(readSealed(jar));
  clearSession(jar);
  if (s?.at) {
    await fetch(`${config.apiUrl}/api/v1/auth/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'logout' }),
    }).catch(() => undefined);
  }
  try {
    const url = client.buildEndSessionUrl(await oidc(), {
      post_logout_redirect_uri: `${config.baseUrl}/login`,
      ...(s?.it ? { id_token_hint: s.it } : {}),
    });
    return NextResponse.redirect(url.href, 303);
  } catch {
    return NextResponse.redirect(`${config.baseUrl}/login`, 303);
  }
}

import * as client from 'openid-client';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getLocale } from '@/lib/i18n';
import { oidc } from '@/lib/oidc';
import { cookieOptions, seal } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** OIDC Authorization Code + PKCE. state/nonce/verifier shifrlangan qisqa muddatli cookie'da. */
export async function GET() {
  const cfg = await oidc();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const locale = await getLocale();
  const url = client.buildAuthorizationUrl(cfg, {
    redirect_uri: `${config.baseUrl}/auth/callback`,
    scope: 'openid profile email',
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
    ui_locales: locale === 'uz-Cyrl' ? 'uz' : locale,
  });
  const sealed = await seal({ at: '', exp: 0, sub: '', name: JSON.stringify({ verifier, state, nonce }) });
  (await cookies()).set('gm_oidc', sealed, { ...cookieOptions(), maxAge: 600 });
  return NextResponse.redirect(url.href);
}

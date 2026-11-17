import 'server-only';
import * as client from 'openid-client';
import { config } from './config';
import { Session } from './session';

let cached: Promise<client.Configuration> | null = null;

export function oidc(): Promise<client.Configuration> {
  if (!cached) {
    const options: Parameters<typeof client.discovery>[4] = {};
    if (!config.oidcIssuer.startsWith('https://')) options.execute = [client.allowInsecureRequests];
    cached = client
      .discovery(new URL(config.oidcIssuer), config.oidcClientId, config.oidcClientSecret, undefined, options)
      .catch((e) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}

export function toSession(tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers, prev?: Session): Session {
  const claims = tokens.claims();
  return {
    at: tokens.access_token,
    rt: tokens.refresh_token ?? prev?.rt,
    it: tokens.id_token ?? prev?.it,
    exp: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 300),
    sub: (claims?.sub as string | undefined) ?? prev?.sub ?? '',
    name: (claims?.name as string | undefined) ?? prev?.name,
  };
}

export async function refresh(s: Session): Promise<Session | null> {
  if (!s.rt) return null;
  try {
    const tokens = await client.refreshTokenGrant(await oidc(), s.rt);
    return toSession(tokens, s);
  } catch {
    return null;
  }
}

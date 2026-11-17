import 'server-only';
import * as client from 'openid-client';
import { config } from './config';
import { Session } from './session';

let cached: Promise<client.Configuration> | null = null;

/**
 * OIDC konfiguratsiyasi. Metadata ichki manzildan olinadi (Docker'da web konteyner tashqi
 * `localhost` ga chiqa olmaydi), lekin issuer tashqi manzil bilan qat'iy solishtiriladi.
 * Keycloak `hostname-backchannel-dynamic` bilan token/jwks endpointlarini ichki manzilda beradi.
 */
export function oidc(): Promise<client.Configuration> {
  if (!cached) {
    cached = (async () => {
      const discovery = config.oidcDiscoveryUrl.replace(/\/$/, '');
      const res = await fetch(`${discovery}/.well-known/openid-configuration`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
      const metadata = (await res.json()) as client.ServerMetadata;
      if (metadata.issuer !== config.oidcIssuer.replace(/\/$/, '')) {
        throw new Error(`OIDC issuer mismatch: expected ${config.oidcIssuer}, got ${metadata.issuer}`);
      }
      const cfg = new client.Configuration(metadata, config.oidcClientId, config.oidcClientSecret);
      if (!discovery.startsWith('https://') || !config.oidcIssuer.startsWith('https://')) client.allowInsecureRequests(cfg);
      return cfg;
    })().catch((e) => {
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

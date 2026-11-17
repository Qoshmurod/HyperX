import 'server-only';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  get apiUrl() {
    return (process.env.API_INTERNAL_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  },
  get baseUrl() {
    return (process.env.WEB_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  },
  get oidcIssuer() {
    return req('OIDC_ISSUER_URL');
  },
  /** Server ichidan Keycloak'ga murojaat manzili (Docker: http://keycloak:8080/realms/govmind). Bo'sh bo'lsa — issuer. */
  get oidcDiscoveryUrl() {
    return process.env.OIDC_DISCOVERY_URL || this.oidcIssuer;
  },
  get oidcClientId() {
    return process.env.OIDC_CLIENT_ID ?? 'govmind-web';
  },
  get oidcClientSecret() {
    return process.env.OIDC_CLIENT_SECRET || undefined;
  },
  get sessionSecret() {
    const s = req('SESSION_SECRET');
    if (s.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
    return s;
  },
  get secureCookies() {
    return (process.env.WEB_BASE_URL ?? '').startsWith('https://');
  },
};

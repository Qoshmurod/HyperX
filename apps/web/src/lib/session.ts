import 'server-only';
import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { config } from './config';

export interface Session {
  /** access token (Keycloak) */
  at: string;
  /** refresh token */
  rt?: string;
  /** id token — chiqishda Keycloak sessiyasini yopish uchun */
  it?: string;
  /** access token tugash vaqti (unix soniya) */
  exp: number;
  sub: string;
  name?: string;
}

export const SESSION_COOKIE = 'gm_session';
const CHUNK = 3500;
const MAX_CHUNKS = 5;
const MAX_AGE = 60 * 60 * 10;

function key(): Uint8Array {
  return createHash('sha256').update(config.sessionSecret).digest();
}

export async function seal(s: Session): Promise<string> {
  return new EncryptJWT({ ...s })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(key());
}

export async function unseal(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export interface CookieJar {
  get(name: string): { value: string } | undefined;
}

export interface CookieWriter {
  set(name: string, value: string, opts: Record<string, unknown>): void;
  delete(name: string): void;
}

export function readSealed(jar: CookieJar): string | undefined {
  const parts: string[] = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const c = jar.get(`${SESSION_COOKIE}.${i}`);
    if (!c) break;
    parts.push(c.value);
  }
  return parts.length ? parts.join('') : undefined;
}

export function cookieOptions() {
  return { httpOnly: true, secure: config.secureCookies, sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };
}

/** JWE hajmi 4KB cookie chegarasidan oshishi mumkin — bo'laklarga ajratiladi. */
export function writeSealed(writer: CookieWriter, sealed: string) {
  const chunks = sealed.match(new RegExp(`.{1,${CHUNK}}`, 'g')) ?? [];
  if (chunks.length > MAX_CHUNKS) throw new Error('Session too large');
  chunks.forEach((c, i) => writer.set(`${SESSION_COOKIE}.${i}`, c, cookieOptions()));
  for (let i = chunks.length; i < MAX_CHUNKS; i++) writer.delete(`${SESSION_COOKIE}.${i}`);
}

export function clearSession(writer: CookieWriter) {
  for (let i = 0; i < MAX_CHUNKS; i++) writer.delete(`${SESSION_COOKIE}.${i}`);
}

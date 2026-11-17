import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', '0.0.0.0', '::', '::1']);

/**
 * SSRF'dan himoya: faqat http(s), metadata/loopback manzillari taqiqlangan.
 * WEBHOOK_ALLOWED_HOSTS berilsa, faqat ro'yxatdagi xostlarga yuboriladi.
 */
export function assertWebhookUrl(raw: string, env: NodeJS.ProcessEnv = process.env): URL {
  const url = new URL(raw);
  const allowHttp = env.WEBHOOK_ALLOW_HTTP === 'true';
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new Error('Webhook URL must use https');
  if (url.username || url.password) throw new Error('Credentials in URL are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host)) throw new Error('Host is not allowed');
  if (isIP(host) === 4 && (/^127\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host))) throw new Error('Host is not allowed');
  if (isIP(host) === 6 && (/^fe80:/i.test(host) || /^::ffff:127\./i.test(host))) throw new Error('Host is not allowed');
  const allowed = (env.WEBHOOK_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(host)) throw new Error('Host is not in WEBHOOK_ALLOWED_HOSTS');
  return url;
}

/** Qabul qiluvchi tekshiradi: HMAC-SHA256(secret, `${timestamp}.${body}`). */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

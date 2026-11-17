import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Lang } from '../ai/ai-engine.client';

export const LANGS: Lang[] = ['uz', 'uz-Cyrl', 'ru', 'en'];

export function parseLang(value: string | undefined | null): Lang {
  if (!value) return 'uz';
  const v = value.split(',')[0].trim();
  if (/^uz-cyrl/i.test(v)) return 'uz-Cyrl';
  if (/^ru/i.test(v)) return 'ru';
  if (/^en/i.test(v)) return 'en';
  return 'uz';
}

/** `X-Lang` yoki `Accept-Language` sarlavhasidan til. */
export const RequestLang = createParamDecorator((_: unknown, ctx: ExecutionContext): Lang => {
  const req = ctx.switchToHttp().getRequest();
  return parseLang(req.headers['x-lang'] ?? req.headers['accept-language']);
});

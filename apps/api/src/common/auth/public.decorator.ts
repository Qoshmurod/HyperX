import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from './principal';

export const IS_PUBLIC_KEY = 'govmind:isPublic';
export const REQUIRED_PERMISSION_KEY = 'govmind:requiredPermission';
export const NODE_AUTH_KEY = 'govmind:nodeAuth';
export const ALLOW_API_CLIENT_KEY = 'govmind:allowApiClient';

/** Autentifikatsiyasiz ochiq endpoint (faqat health kabi). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Endpoint uchun talab qilinadigan ruxsat (RBAC). Hudud/maxfiylik — RLS va servis qatlamida. */
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION_KEY, permission);

/** Faqat boshqa GovMind tuguni (X-Node-Token) chaqira oladigan endpoint. */
export const NodeAuth = () => SetMetadata(NODE_AUTH_KEY, true);

/** Tashqi tizim API kaliti (X-Api-Key) bilan ham chaqirish mumkin bo'lgan endpoint. */
export const AllowApiClient = () => SetMetadata(ALLOW_API_CLIENT_KEY, true);

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthPrincipal => ctx.switchToHttp().getRequest().principal,
);

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const req = ctx.switchToHttp().getRequest();
  return req.ip ?? null;
});

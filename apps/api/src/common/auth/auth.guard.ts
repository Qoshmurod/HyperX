import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Global guard. Hozircha token tekshiruvi ulanmagan (Phase 2: Keycloak OIDC / JWKS),
 * shuning uchun @Public() bo'lmagan barcha so'rovlar rad etiladi — xavfsiz standart holat.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // TODO(Phase 2): Bearer tokenni Keycloak JWKS orqali tekshirish, Principal'ni yuklash,
    // REQUIRED_PERMISSION_KEY bo'yicha RBAC tekshiruvi va audit yozuvi.
    throw new UnauthorizedException();
  }
}

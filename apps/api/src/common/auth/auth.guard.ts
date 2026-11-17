import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_API_CLIENT_KEY, IS_PUBLIC_KEY, NODE_AUTH_KEY, REQUIRED_PERMISSION_KEY } from './public.decorator';
import { AuthPrincipal, hasPermission } from './principal';
import { PrincipalLoader } from './principal-loader';
import { TokenVerifier } from './token-verifier';

/**
 * Global guard (deny by default):
 *  - @Public() — tekshiruvsiz;
 *  - @NodeAuth() — faqat X-Node-Token;
 *  - boshqalar — Bearer (Keycloak) yoki @AllowApiClient() bo'lsa X-Api-Key;
 *  - @RequirePermission() — kamida bitta amaldagi grantda shu ruxsat bo'lishi shart.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly loader: PrincipalLoader,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.meta<boolean>(IS_PUBLIC_KEY, ctx)) return true;

    const req = ctx.switchToHttp().getRequest();
    const principal = await this.authenticate(req, ctx);
    if (!principal) throw new UnauthorizedException();
    req.principal = principal;

    const permission = this.meta<string>(REQUIRED_PERMISSION_KEY, ctx);
    if (permission && !hasPermission(principal, permission)) throw new ForbiddenException();
    return true;
  }

  private async authenticate(req: any, ctx: ExecutionContext): Promise<AuthPrincipal | null> {
    if (this.meta<boolean>(NODE_AUTH_KEY, ctx)) {
      const token = req.headers['x-node-token'];
      return typeof token === 'string' && token ? this.loader.fromNodeToken(token) : null;
    }

    const auth: string | undefined = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      let verified;
      try {
        verified = await this.verifier.verify(auth.slice(7));
      } catch {
        return null;
      }
      const principal = await this.loader.fromToken(verified);
      if (!principal) throw new ForbiddenException('User is not registered or not active');
      return principal;
    }

    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey && this.meta<boolean>(ALLOW_API_CLIENT_KEY, ctx)) {
      return this.loader.fromApiKey(apiKey);
    }
    return null;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { createLocalJWKSet, createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';
import { APP_CONFIG, AppConfig } from '../../config';

export interface VerifiedToken {
  sub: string;
  username?: string;
  name?: string;
  email?: string;
  acr?: string;
  amr?: string[];
  payload: JWTPayload;
}

type KeySet = ReturnType<typeof createRemoteJWKSet> | ReturnType<typeof createLocalJWKSet>;

@Injectable()
export class TokenVerifier {
  private keys: KeySet;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const { jwksFile, jwksUrl, issuer } = config.oidc;
    this.keys = jwksFile
      ? createLocalJWKSet(JSON.parse(readFileSync(jwksFile, 'utf8')))
      : createRemoteJWKSet(new URL(jwksUrl ?? `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`));
  }

  async verify(token: string): Promise<VerifiedToken> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.config.oidc.issuer,
      audience: this.config.oidc.audience,
      algorithms: ['RS256', 'ES256', 'PS256'],
      clockTolerance: 30,
    });
    if (!payload.sub) throw new Error('Token has no subject');
    return {
      sub: payload.sub,
      username: payload.preferred_username as string | undefined,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
      acr: payload.acr as string | undefined,
      amr: payload.amr as string[] | undefined,
      payload,
    };
  }
}

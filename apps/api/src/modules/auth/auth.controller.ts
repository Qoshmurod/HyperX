import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal, permissionsOf } from '../../common/auth/principal';
import { ClientIp, CurrentPrincipal } from '../../common/auth/public.decorator';
import { DbService, rows } from '../../common/db/db.service';
import { ZodPipe } from '../../common/http/zod.pipe';

const sessionEvent = z.object({ type: z.enum(['login', 'logout']), user_agent: z.string().max(500).optional() });

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  async me(@CurrentPrincipal() p: AuthPrincipal) {
    const units = await this.db.scoped(p, 'organizations.read', (tx) =>
      rows(tx, `SELECT id, name, level, path::text AS path FROM organization.administrative_units ORDER BY path`),
    );
    return {
      id: p.id,
      kind: p.kind,
      username: p.username,
      full_name: p.displayName,
      permissions: permissionsOf(p),
      grants: p.grants.map((g) => ({
        role: g.role, scope_path: g.scopePath, max_classification: g.maxClassification, valid_until: g.validUntil ?? null,
      })),
      units,
    };
  }

  /** Web BFF kirish/chiqish hodisalarini auditga yozadi (Keycloak tomonidagi jurnalga qo'shimcha). */
  @Post('events')
  @HttpCode(204)
  async event(
    @CurrentPrincipal() p: AuthPrincipal,
    @ClientIp() ip: string | null,
    @Body(new ZodPipe(sessionEvent)) body: z.infer<typeof sessionEvent>,
  ) {
    await this.db.system((tx) =>
      this.audit.record(tx, p, { action: `auth.${body.type}`, resourceType: 'iam.users', resourceId: p.actorId, ip, data: { user_agent: body.user_agent } }),
    );
  }
}

import {
  Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { classificationAllows, isGrantActive, isWithinScope } from '../../common/auth/access-policy';
import { AuthPrincipal } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows, Tx } from '../../common/db/db.service';
import { classification, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';

const userCreate = z.object({
  username: z.string().regex(/^[a-z0-9._-]{3,100}$/),
  full_name: z.string().min(3).max(255),
  email: z.string().email().optional(),
  organization_id: uuid,
  department_id: uuid.optional(),
  position: z.string().max(255).optional(),
});

const userUpdate = z.object({
  full_name: z.string().min(3).max(255).optional(),
  email: z.string().email().nullable().optional(),
  status: z.enum(['active', 'locked', 'disabled']).optional(),
});

const grantCreate = z.object({
  role_code: z.string(),
  administrative_unit_id: uuid,
  max_classification: classification,
  valid_until: z.string().datetime().optional(),
});

/** Faqat super_admin bera oladigan rollar. */
const PRIVILEGED_ROLES = new Set(['super_admin', 'republic_admin']);

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Get('roles')
  @RequirePermission('organizations.read')
  roles(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'organizations.read', (tx) =>
      rows(
        tx,
        `SELECT r.id, r.code, r.name, r.is_system,
                COALESCE(array_agg(pm.code ORDER BY pm.code) FILTER (WHERE pm.code IS NOT NULL), '{}') AS permissions
         FROM iam.roles r LEFT JOIN iam.role_permissions rp ON rp.role_id = r.id
         LEFT JOIN iam.permissions pm ON pm.id = rp.permission_id
         GROUP BY r.id ORDER BY r.code`,
      ),
    );
  }

  @Get('permissions')
  @RequirePermission('organizations.read')
  permissions(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'organizations.read', (tx) => rows(tx, 'SELECT code, description FROM iam.permissions ORDER BY code'));
  }

  /** Doiradagi xodimlar: doiradagi tashkilot a'zolari yoki doiradagi hududda roli borlar. */
  @Get('users')
  @RequirePermission('users.manage')
  list(@CurrentPrincipal() p: AuthPrincipal, @Query('q') q?: string, @Query('organization_id') orgId?: string) {
    return this.db.scoped(p, 'users.manage', (tx) =>
      rows(
        tx,
        `SELECT u.id, u.username, u.full_name, u.email, u.status, u.created_at,
                (u.external_auth_id LIKE 'pending:%') AS pending_link,
                (SELECT json_agg(json_build_object('organization_id', m.organization_id, 'name', o.name, 'position', m.position))
                   FROM iam.organization_memberships m JOIN organization.organizations o ON o.id = m.organization_id
                  WHERE m.user_id = u.id) AS memberships
         FROM iam.users u
         WHERE (EXISTS (SELECT 1 FROM iam.organization_memberships m WHERE m.user_id = u.id AND app.org_visible(m.organization_id)
                        AND ($2::uuid IS NULL OR m.organization_id = $2))
                OR ($2::uuid IS NULL AND EXISTS (
                    SELECT 1 FROM iam.user_roles ur JOIN organization.administrative_units au ON au.id = ur.administrative_unit_id
                    WHERE ur.user_id = u.id AND app.path_visible(au.path))))
           AND ($1::text IS NULL OR u.full_name ILIKE '%' || $1 || '%' OR u.username ILIKE '%' || $1 || '%')
         ORDER BY u.full_name LIMIT 500`,
        [q || null, orgId || null],
      ),
    );
  }

  @Get('users/:id')
  @RequirePermission('users.manage')
  get(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'users.manage', async (tx) => {
      await this.assertUserVisible(tx, id);
      const user = await one(tx, `SELECT id, username, full_name, email, status, created_at,
                                         (external_auth_id LIKE 'pending:%') AS pending_link FROM iam.users WHERE id = $1`, [id]);
      const grants = await rows(
        tx,
        `SELECT ur.id, r.code AS role_code, r.name AS role_name, au.id AS administrative_unit_id, au.name AS unit_name,
                au.path::text AS unit_path, ur.max_classification, ur.valid_from, ur.valid_until
         FROM iam.user_roles ur JOIN iam.roles r ON r.id = ur.role_id
         JOIN organization.administrative_units au ON au.id = ur.administrative_unit_id
         WHERE ur.user_id = $1 ORDER BY au.path`,
        [id],
      );
      const memberships = await rows(
        tx,
        `SELECT m.organization_id, o.name, m.department_id, d.name AS department_name, m.position
         FROM iam.organization_memberships m JOIN organization.organizations o ON o.id = m.organization_id
         LEFT JOIN organization.departments d ON d.id = m.department_id WHERE m.user_id = $1`,
        [id],
      );
      return { ...user, grants, memberships };
    });
  }

  @Post('users')
  @RequirePermission('users.manage')
  create(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(userCreate)) body: z.infer<typeof userCreate>) {
    return this.db.scoped(p, 'users.manage', async (tx) => {
      await assertCanAtOrg(tx, p, 'users.manage', body.organization_id);
      const user = await one<{ id: string }>(
        tx,
        `INSERT INTO iam.users (external_auth_id, username, full_name, email)
         VALUES ('pending:' || $1, $1, $2, $3) RETURNING id, username, full_name, email, status`,
        [body.username, body.full_name, body.email ?? null],
      );
      await tx.query(
        'INSERT INTO iam.organization_memberships (user_id, organization_id, department_id, position) VALUES ($1, $2, $3, $4)',
        [user!.id, body.organization_id, body.department_id ?? null, body.position ?? null],
      );
      await this.audit.record(tx, p, {
        action: 'user.created', resourceType: 'iam.users', resourceId: user!.id, organizationId: body.organization_id,
        data: { username: body.username },
      });
      return user;
    });
  }

  @Patch('users/:id')
  @RequirePermission('users.manage')
  update(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(userUpdate)) body: z.infer<typeof userUpdate>,
  ) {
    return this.db.scoped(p, 'users.manage', async (tx) => {
      await this.assertUserVisible(tx, id);
      if (id === p.actorId && body.status && body.status !== 'active') throw new ForbiddenException('Cannot disable yourself');
      const user = await one(
        tx,
        `UPDATE iam.users SET full_name = COALESCE($2, full_name),
           email = CASE WHEN $5 THEN $3 ELSE email END, status = COALESCE($4, status)
         WHERE id = $1 RETURNING id, username, full_name, email, status`,
        [id, body.full_name ?? null, body.email ?? null, body.status ?? null, body.email !== undefined],
      );
      await this.audit.record(tx, p, { action: 'user.updated', resourceType: 'iam.users', resourceId: id, data: body });
      return user;
    });
  }

  @Post('users/:id/roles')
  @RequirePermission('roles.manage')
  grant(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(grantCreate)) body: z.infer<typeof grantCreate>,
  ) {
    return this.db.scoped(p, 'roles.manage', async (tx) => {
      await this.assertUserVisible(tx, id);
      const unit = await one<{ path: string }>(
        tx,
        'SELECT path::text AS path FROM organization.administrative_units WHERE id = $1',
        [body.administrative_unit_id],
      );
      if (!unit) throw new NotFoundException('Administrative unit not found');
      const role = await one<{ id: string; code: string; permissions: string[] }>(
        tx,
        `SELECT r.id, r.code, COALESCE(array_agg(pm.code) FILTER (WHERE pm.code IS NOT NULL), '{}') AS permissions
         FROM iam.roles r LEFT JOIN iam.role_permissions rp ON rp.role_id = r.id
         LEFT JOIN iam.permissions pm ON pm.id = rp.permission_id WHERE r.code = $1 GROUP BY r.id`,
        [body.role_code],
      );
      if (!role) throw new NotFoundException('Role not found');
      assertNoEscalation(p, role, unit.path, body.max_classification);

      const grant = await one<{ id: string }>(
        tx,
        `INSERT INTO iam.user_roles (user_id, role_id, administrative_unit_id, max_classification, valid_until, granted_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [id, role.id, body.administrative_unit_id, body.max_classification, body.valid_until ?? null, p.actorId],
      );
      await this.audit.record(tx, p, {
        action: 'permission.granted', resourceType: 'iam.user_roles', resourceId: grant!.id,
        data: { user_id: id, role: role.code, unit: unit.path, max_classification: body.max_classification, valid_until: body.valid_until },
      });
      return grant;
    });
  }

  @Delete('users/:id/roles/:grantId')
  @RequirePermission('roles.manage')
  revoke(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    return this.db.scoped(p, 'roles.manage', async (tx) => {
      const g = await one<{ path: string; code: string; permissions: string[]; max_classification: any }>(
        tx,
        `SELECT au.path::text AS path, r.code, ur.max_classification,
                COALESCE(array_agg(pm.code) FILTER (WHERE pm.code IS NOT NULL), '{}') AS permissions
         FROM iam.user_roles ur JOIN iam.roles r ON r.id = ur.role_id
         JOIN organization.administrative_units au ON au.id = ur.administrative_unit_id
         LEFT JOIN iam.role_permissions rp ON rp.role_id = r.id LEFT JOIN iam.permissions pm ON pm.id = rp.permission_id
         WHERE ur.id = $1 AND ur.user_id = $2 GROUP BY ur.id, au.path, r.code`,
        [grantId, id],
      );
      if (!g) throw new NotFoundException();
      // Olib tashlash uchun ham shu grantni bera olish huquqi kerak.
      assertNoEscalation(p, { code: g.code, permissions: g.permissions }, g.path, g.max_classification);
      await tx.query('DELETE FROM iam.user_roles WHERE id = $1', [grantId]);
      await this.audit.record(tx, p, {
        action: 'permission.revoked', resourceType: 'iam.user_roles', resourceId: grantId, data: { user_id: id, role: g.code, unit: g.path },
      });
      return { revoked: true };
    });
  }

  private async assertUserVisible(tx: Tx, userId: string) {
    const visible = await one(
      tx,
      `SELECT 1 FROM iam.users u WHERE u.id = $1 AND (
         EXISTS (SELECT 1 FROM iam.organization_memberships m WHERE m.user_id = u.id AND app.org_visible(m.organization_id))
         OR EXISTS (SELECT 1 FROM iam.user_roles ur JOIN organization.administrative_units au ON au.id = ur.administrative_unit_id
                    WHERE ur.user_id = u.id AND app.path_visible(au.path)))`,
      [userId],
    );
    if (!visible) throw new NotFoundException('User not found');
  }
}

/**
 * Huquqni oshirib yuborishdan himoya: beruvchi shu hududda `roles.manage` ga ega bo'lishi,
 * berilayotgan maxfiylik darajasi va rol ruxsatlari o'zinikidan oshmasligi kerak.
 */
export function assertNoEscalation(
  p: AuthPrincipal,
  role: { code: string; permissions: string[] },
  path: string,
  maxClassification: z.infer<typeof classification>,
  now = new Date(),
) {
  if (PRIVILEGED_ROLES.has(role.code) && !p.grants.some((g) => g.role === 'super_admin' && isGrantActive(g, now))) {
    throw new ForbiddenException('Only super admin can grant this role');
  }
  const covering = p.grants.filter((g) => isGrantActive(g, now) && isWithinScope(path, g.scopePath));
  const canManage = covering.some(
    (g) => g.permissions.includes('roles.manage') && classificationAllows(g.maxClassification, maxClassification),
  );
  if (!canManage) throw new ForbiddenException('Grant exceeds your own scope or classification');
  const own = new Set(covering.flatMap((g) => g.permissions));
  const missing = role.permissions.filter((x) => !own.has(x));
  if (missing.length > 0) throw new ForbiddenException(`Role has permissions you do not hold: ${missing.join(', ')}`);
}

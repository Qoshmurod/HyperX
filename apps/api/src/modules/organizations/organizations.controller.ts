import {
  Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../../config';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal, canAt } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows } from '../../common/db/db.service';
import { EventsService } from '../../common/events/events.service';
import { VersionConflict } from '../../common/http/errors';
import { uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';

const unitCreate = z.object({
  parent_id: uuid,
  level: z.enum(['region', 'district']),
  name: z.string().min(2).max(255),
  code: z.string().regex(/^[A-Za-z0-9_-]{2,100}$/),
  /** ltree yorlig'i: kichik lotin harflar, raqam, pastki chiziq */
  slug: z.string().regex(/^[a-z0-9_]{1,60}$/),
});

const orgCreate = z.object({
  administrative_unit_id: uuid,
  parent_id: uuid.optional(),
  name: z.string().min(2).max(255),
  code: z.string().regex(/^[A-Za-z0-9_-]{2,100}$/),
  organization_type: z.string().min(2).max(50),
});

const orgUpdate = z.object({
  name: z.string().min(2).max(255).optional(),
  organization_type: z.string().min(2).max(50).optional(),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
  version: z.number().int(),
});

const deptCreate = z.object({ name: z.string().min(2).max(255), parent_id: uuid.optional() });

@ApiTags('organizations')
@ApiBearerAuth()
@Controller()
export class OrganizationsController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('administrative-units')
  @RequirePermission('organizations.read')
  units(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'organizations.read', (tx) =>
      rows(tx, 'SELECT id, parent_id, level, name, code, path::text AS path FROM organization.administrative_units ORDER BY path'),
    );
  }

  @Post('administrative-units')
  @RequirePermission('organizations.manage')
  createUnit(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(unitCreate)) body: z.infer<typeof unitCreate>) {
    return this.db.scoped(p, 'organizations.manage', async (tx) => {
      const parent = await one<{ path: string; level: string }>(
        tx,
        'SELECT path::text AS path, level FROM organization.administrative_units WHERE id = $1',
        [body.parent_id],
      );
      if (!parent) throw new NotFoundException('Parent unit not found');
      if (!canAt(p, 'organizations.manage', parent.path)) throw new ForbiddenException();
      const expectedParent = body.level === 'region' ? 'republic' : 'region';
      if (parent.level !== expectedParent) {
        throw new ForbiddenException(`A ${body.level} must be placed under a ${expectedParent}`);
      }
      const unit = await one<{ id: string }>(
        tx,
        `INSERT INTO organization.administrative_units (parent_id, level, name, code, path)
         VALUES ($1, $2, $3, $4, ($5 || '.' || $6)::ltree) RETURNING id, parent_id, level, name, code, path::text AS path, version`,
        [body.parent_id, body.level, body.name, body.code, parent.path, body.slug],
      );
      await this.events.emit(tx, {
        type: 'unit.created', adminUnitPath: (unit as any).path, resourceType: 'organization.administrative_units',
        resourceId: unit!.id, operation: 'insert', baseVersion: null, newVersion: 1, payload: unit!,
      });
      await this.audit.record(tx, p, {
        action: 'unit.created', resourceType: 'organization.administrative_units', resourceId: unit!.id, data: body,
      });
      return unit;
    });
  }

  @Get('organizations')
  @RequirePermission('organizations.read')
  list(@CurrentPrincipal() p: AuthPrincipal, @Query('q') q?: string, @Query('unit_id') unitId?: string) {
    return this.db.scoped(p, 'organizations.read', (tx) =>
      rows(
        tx,
        `SELECT o.id, o.parent_id, o.name, o.code, o.organization_type, o.status, o.version,
                o.administrative_unit_id, u.name AS unit_name, u.path::text AS unit_path
         FROM organization.organizations o JOIN organization.administrative_units u ON u.id = o.administrative_unit_id
         WHERE ($1::text IS NULL OR o.name ILIKE '%' || $1 || '%' OR o.code ILIKE '%' || $1 || '%')
           AND ($2::uuid IS NULL OR u.path <@ (SELECT path FROM organization.administrative_units WHERE id = $2))
         ORDER BY u.path, o.name LIMIT 500`,
        [q || null, unitId || null],
      ),
    );
  }

  @Get('organizations/:id')
  @RequirePermission('organizations.read')
  get(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'organizations.read', async (tx) => {
      const org = await one(
        tx,
        `SELECT o.*, u.name AS unit_name, u.path::text AS unit_path FROM organization.organizations o
         JOIN organization.administrative_units u ON u.id = o.administrative_unit_id WHERE o.id = $1`,
        [id],
      );
      if (!org) throw new NotFoundException();
      const departments = await rows(
        tx,
        'SELECT id, parent_id, name FROM organization.departments WHERE organization_id = $1 ORDER BY name',
        [id],
      );
      return { ...org, departments };
    });
  }

  @Post('organizations')
  @RequirePermission('organizations.manage')
  create(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(orgCreate)) body: z.infer<typeof orgCreate>) {
    return this.db.scoped(p, 'organizations.manage', async (tx) => {
      const unit = await one<{ path: string }>(
        tx,
        'SELECT path::text AS path FROM organization.administrative_units WHERE id = $1',
        [body.administrative_unit_id],
      );
      if (!unit) throw new NotFoundException('Administrative unit not found');
      if (!canAt(p, 'organizations.manage', unit.path)) throw new ForbiddenException();
      const org = await one<{ id: string; version: number }>(
        tx,
        `INSERT INTO organization.organizations (administrative_unit_id, parent_id, name, code, organization_type, owner_node_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [body.administrative_unit_id, body.parent_id ?? null, body.name, body.code, body.organization_type, this.config.nodeId],
      );
      await this.events.emit(tx, {
        type: 'organization.created', organizationId: org!.id, resourceType: 'organization.organizations',
        resourceId: org!.id, operation: 'insert', baseVersion: null, newVersion: org!.version, payload: org!,
      });
      await this.audit.record(tx, p, {
        action: 'organization.created', resourceType: 'organization.organizations', resourceId: org!.id, organizationId: org!.id,
      });
      return org;
    });
  }

  @Patch('organizations/:id')
  @RequirePermission('organizations.manage')
  update(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(orgUpdate)) body: z.infer<typeof orgUpdate>,
  ) {
    return this.db.scoped(p, 'organizations.manage', async (tx) => {
      await assertCanAtOrg(tx, p, 'organizations.manage', id);
      const org = await one<{ id: string; version: number }>(
        tx,
        `UPDATE organization.organizations SET
           name = COALESCE($2, name), organization_type = COALESCE($3, organization_type), status = COALESCE($4, status)
         WHERE id = $1 AND version = $5 RETURNING *`,
        [id, body.name ?? null, body.organization_type ?? null, body.status ?? null, body.version],
      );
      if (!org) throw new VersionConflict();
      await this.events.emit(tx, {
        type: 'organization.updated', organizationId: id, resourceType: 'organization.organizations', resourceId: id,
        operation: 'update', baseVersion: body.version, newVersion: org.version, payload: org,
      });
      await this.audit.record(tx, p, {
        action: 'organization.updated', resourceType: 'organization.organizations', resourceId: id, organizationId: id, data: body,
      });
      return org;
    });
  }

  @Post('organizations/:id/departments')
  @RequirePermission('organizations.manage')
  createDepartment(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(deptCreate)) body: z.infer<typeof deptCreate>,
  ) {
    return this.db.scoped(p, 'organizations.manage', async (tx) => {
      await assertCanAtOrg(tx, p, 'organizations.manage', id);
      const dept = await one<{ id: string }>(
        tx,
        'INSERT INTO organization.departments (organization_id, parent_id, name) VALUES ($1, $2, $3) RETURNING *',
        [id, body.parent_id ?? null, body.name],
      );
      await this.audit.record(tx, p, {
        action: 'department.created', resourceType: 'organization.departments', resourceId: dept!.id, organizationId: id,
      });
      return dept;
    });
  }
}

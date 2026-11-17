import {
  Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal } from '../../common/auth/principal';
import { AllowApiClient, CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService, one, rows, Tx } from '../../common/db/db.service';
import { EventsService } from '../../common/events/events.service';
import { VersionConflict } from '../../common/http/errors';
import { classification, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { assertCanAtOrg } from '../../common/scope';

export const TASK_STATUSES = ['new', 'in_progress', 'done', 'cancelled'] as const;
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;

export const taskCreate = z.object({
  organization_id: uuid,
  department_id: uuid.optional(),
  title: z.string().min(3).max(500),
  description: z.string().max(20_000).optional(),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  classification: classification.default('internal'),
  deadline: z.string().datetime({ offset: true }).optional(),
  assignee_ids: z.array(uuid).max(50).default([]),
});

const taskUpdate = z.object({
  title: z.string().min(3).max(500).optional(),
  description: z.string().max(20_000).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  version: z.number().int(),
});

const listQuery = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  organization_id: uuid.optional(),
  overdue: z.enum(['true', 'false']).optional(),
  mine: z.enum(['true', 'false']).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  @Get()
  @AllowApiClient()
  @RequirePermission('tasks.read')
  list(@CurrentPrincipal() p: AuthPrincipal, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.db.scoped(p, 'tasks.read', async (tx) => {
      const where = `
        ($1::text IS NULL OR t.status = $1)
        AND ($2::uuid IS NULL OR t.organization_id = $2)
        AND (NOT $3 OR (t.status IN ('new','in_progress') AND t.deadline < now()))
        AND (NOT $4 OR EXISTS (SELECT 1 FROM core.task_assignments a WHERE a.task_id = t.id AND a.user_id = $5))
        AND ($6::text IS NULL OR t.title ILIKE '%' || $6 || '%')`;
      const params = [q.status ?? null, q.organization_id ?? null, q.overdue === 'true', q.mine === 'true', p.actorId, q.q ?? null];
      const items = await rows(
        tx,
        `SELECT t.id, t.organization_id, o.name AS organization_name, t.title, t.priority, t.status, t.classification,
                t.deadline, t.completed_at, t.created_at, t.version,
                (t.status IN ('new','in_progress') AND t.deadline < now()) AS overdue,
                (SELECT json_agg(json_build_object('id', u.id, 'full_name', u.full_name))
                   FROM core.task_assignments a JOIN iam.users u ON u.id = a.user_id WHERE a.task_id = t.id) AS assignees
         FROM core.tasks t JOIN organization.organizations o ON o.id = t.organization_id
         WHERE ${where}
         ORDER BY (t.status IN ('new','in_progress') AND t.deadline < now()) DESC, t.deadline NULLS LAST, t.created_at DESC
         LIMIT $7 OFFSET $8`,
        [...params, q.limit, q.offset],
      );
      const total = await one<{ n: number }>(tx, `SELECT count(*)::int AS n FROM core.tasks t WHERE ${where}`, params);
      return { items, total: total!.n };
    });
  }

  @Get(':id')
  @RequirePermission('tasks.read')
  get(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.scoped(p, 'tasks.read', async (tx) => {
      const task = await one(
        tx,
        `SELECT t.*, o.name AS organization_name, d.name AS department_name, cu.full_name AS created_by_name,
                (t.status IN ('new','in_progress') AND t.deadline < now()) AS overdue
         FROM core.tasks t JOIN organization.organizations o ON o.id = t.organization_id
         LEFT JOIN organization.departments d ON d.id = t.department_id
         JOIN iam.users cu ON cu.id = t.created_by WHERE t.id = $1`,
        [id],
      );
      if (!task) throw new NotFoundException();
      const assignees = await rows(
        tx,
        `SELECT u.id, u.full_name, a.role, a.assigned_at FROM core.task_assignments a JOIN iam.users u ON u.id = a.user_id
         WHERE a.task_id = $1 ORDER BY a.assigned_at`,
        [id],
      );
      return { ...task, assignees };
    });
  }

  @Post()
  @AllowApiClient()
  @RequirePermission('tasks.manage')
  create(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(taskCreate)) body: z.infer<typeof taskCreate>) {
    return this.db.scoped(p, 'tasks.manage', (tx) => createTask(tx, p, body, this.audit, this.events));
  }

  @Patch(':id')
  @RequirePermission('tasks.manage')
  update(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(taskUpdate)) body: z.infer<typeof taskUpdate>,
  ) {
    return this.db.scoped(p, 'tasks.manage', async (tx) => {
      const current = await one<{ organization_id: string; status: string }>(
        tx,
        'SELECT organization_id, status FROM core.tasks WHERE id = $1',
        [id],
      );
      if (!current) throw new NotFoundException();
      const status = body.status ?? current.status;
      const task = await one<{ id: string; version: number; organization_id: string }>(
        tx,
        `UPDATE core.tasks SET
           title = COALESCE($2::text, title),
           description = CASE WHEN $3::boolean THEN $4::text ELSE description END,
           priority = COALESCE($5::text, priority),
           status = $6::text,
           completed_at = CASE WHEN $6::text = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END,
           deadline = CASE WHEN $7::boolean THEN $8::timestamptz ELSE deadline END
         WHERE id = $1 AND version = $9 RETURNING *`,
        [
          id, body.title ?? null, body.description !== undefined, body.description ?? null, body.priority ?? null,
          status, body.deadline !== undefined, body.deadline ?? null, body.version,
        ],
      );
      if (!task) throw new VersionConflict();
      const type = body.status && body.status !== current.status ? `task.status_changed` : 'task.updated';
      await this.events.emit(tx, {
        type, organizationId: task.organization_id, resourceType: 'core.tasks', resourceId: id,
        operation: 'update', baseVersion: body.version, newVersion: task.version, payload: task,
      });
      await this.audit.record(tx, p, {
        action: type, resourceType: 'core.tasks', resourceId: id, organizationId: task.organization_id,
        data: { changes: { ...body, version: undefined }, from_status: current.status },
      });
      return task;
    });
  }

  @Post(':id/assignees')
  @RequirePermission('tasks.manage')
  assign(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(z.object({ user_id: uuid, role: z.enum(['responsible', 'co_executor', 'controller']).default('responsible') })))
    body: { user_id: string; role: string },
  ) {
    return this.db.scoped(p, 'tasks.manage', async (tx) => {
      const task = await one<{ organization_id: string; title: string }>(tx, 'SELECT organization_id, title FROM core.tasks WHERE id = $1', [id]);
      if (!task) throw new NotFoundException();
      await assertAssignable(tx, body.user_id, task.organization_id);
      await tx.query(
        `INSERT INTO core.task_assignments (task_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (task_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [id, body.user_id, body.role],
      );
      await notifyAssigned(tx, id, task.organization_id, task.title, [body.user_id]);
      await this.audit.record(tx, p, {
        action: 'task.assigned', resourceType: 'core.tasks', resourceId: id, organizationId: task.organization_id, data: body,
      });
      return { assigned: true };
    });
  }

  @Delete(':id/assignees/:userId')
  @RequirePermission('tasks.manage')
  unassign(
    @CurrentPrincipal() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.db.scoped(p, 'tasks.manage', async (tx) => {
      const task = await one<{ organization_id: string }>(tx, 'SELECT organization_id FROM core.tasks WHERE id = $1', [id]);
      if (!task) throw new NotFoundException();
      await tx.query('DELETE FROM core.task_assignments WHERE task_id = $1 AND user_id = $2', [id, userId]);
      await this.audit.record(tx, p, {
        action: 'task.unassigned', resourceType: 'core.tasks', resourceId: id, organizationId: task.organization_id, data: { user_id: userId },
      });
      return { unassigned: true };
    });
  }
}

/** Mas'ul faqat shu tashkilot a'zosi bo'lishi mumkin. */
async function assertAssignable(tx: Tx, userId: string, organizationId: string) {
  const ok = await one(
    tx,
    `SELECT 1 FROM iam.organization_memberships m JOIN iam.users u ON u.id = m.user_id
     WHERE m.user_id = $1 AND m.organization_id = $2 AND u.status = 'active'`,
    [userId, organizationId],
  );
  if (!ok) throw new NotFoundException('Assignee is not an active member of this organization');
}

async function notifyAssigned(tx: Tx, taskId: string, orgId: string, title: string, userIds: string[]) {
  for (const uid of userIds) {
    await tx.query(
      `INSERT INTO core.notifications (user_id, organization_id, kind, severity, title, link, dedupe_key)
       VALUES ($1, $2, 'task_assigned', 'info', $3, $4, $5) ON CONFLICT (dedupe_key) DO NOTHING`,
      [uid, orgId, `Sizga topshiriq biriktirildi: ${title}`.slice(0, 500), `/tasks/${taskId}`, `assigned:${taskId}:${uid}`],
    );
  }
}

/** Import va API orqali ham ishlatiladi. */
export async function createTask(
  tx: Tx,
  p: AuthPrincipal,
  body: z.infer<typeof taskCreate>,
  audit: AuditService,
  events: EventsService,
) {
  await assertCanAtOrg(tx, p, 'tasks.manage', body.organization_id, body.classification);
  for (const uid of body.assignee_ids) await assertAssignable(tx, uid, body.organization_id);

  // API mijozi uchun "yaratuvchi" — kalitni yaratgan foydalanuvchi.
  const createdBy =
    p.actorId ??
    (await one<{ created_by: string }>(tx, 'SELECT created_by FROM integration.api_clients WHERE id = $1', [p.id]))?.created_by;

  const task = await one<{ id: string; version: number }>(
    tx,
    `INSERT INTO core.tasks (organization_id, department_id, title, description, priority, classification, deadline, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      body.organization_id, body.department_id ?? null, body.title, body.description ?? null, body.priority,
      body.classification, body.deadline ?? null, createdBy,
    ],
  );
  for (const uid of body.assignee_ids) {
    await tx.query('INSERT INTO core.task_assignments (task_id, user_id) VALUES ($1, $2)', [task!.id, uid]);
  }
  await notifyAssigned(tx, task!.id, body.organization_id, body.title, body.assignee_ids);
  await events.emit(tx, {
    type: 'task.created', organizationId: body.organization_id, resourceType: 'core.tasks', resourceId: task!.id,
    operation: 'insert', baseVersion: null, newVersion: task!.version, payload: task!,
  });
  await audit.record(tx, p, {
    action: 'task.created', resourceType: 'core.tasks', resourceId: task!.id, organizationId: body.organization_id,
  });
  return task!;
}

import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { NodeLevel } from '../../config';
import { AuditService } from '../../common/audit/audit.service';
import { AuthPrincipal, canAt } from '../../common/auth/principal';
import { CurrentPrincipal, NodeAuth, RequirePermission } from '../../common/auth/public.decorator';
import { randomToken, sha256 } from '../../common/crypto/crypto.service';
import { DbService, one, rows } from '../../common/db/db.service';
import { uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { SyncService } from './sync.service';

const eventSchema = z.object({
  event_id: uuid,
  source_node_id: z.string().min(1).max(100),
  resource_type: z.string().max(100),
  resource_id: uuid,
  operation: z.enum(['insert', 'update', 'delete']),
  base_version: z.number().int().nullable(),
  new_version: z.number().int(),
  payload: z.record(z.unknown()),
  admin_unit_path: z.string().max(1000).nullable(),
});

const pushBody = z.object({ events: z.array(eventSchema).max(500) });

const nodeBody = z.object({
  node_id: z.string().regex(/^[a-z0-9-]{3,100}$/),
  level: z.enum(['region', 'district']),
  administrative_unit_id: uuid,
});

const resolveBody = z.object({ resolution: z.enum(['local', 'incoming']), note: z.string().min(3).max(2000) });

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly db: DbService,
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  /** Quyi tugun o'z o'zgarishlarini yuboradi (X-Node-Token). */
  @Post('events')
  @NodeAuth()
  async push(@CurrentPrincipal() node: AuthPrincipal, @Body(new ZodPipe(pushBody)) body: z.infer<typeof pushBody>) {
    const level = node.grants[0].role.replace('node_', '') as NodeLevel;
    const results = await this.sync.receive(body.events as any, { nodeId: node.id, level, path: node.grants[0].scopePath, trustedUpstream: false });
    return { results };
  }

  /** Quyi tugun yuqoridan o'ziga tegishli o'zgarishlarni oladi. */
  @Get('feed')
  @NodeAuth()
  async feed(@CurrentPrincipal() node: AuthPrincipal, @Query('after') after = '0', @Query('limit') limit = '200') {
    const events = await this.sync.feed(node, Math.max(0, Number(after) || 0), Math.min(500, Math.max(1, Number(limit) || 200)));
    return { events };
  }

  @Get('status')
  @ApiBearerAuth()
  @RequirePermission('sync.resolve')
  status() {
    return this.sync.status();
  }

  @Get('conflicts')
  @ApiBearerAuth()
  @RequirePermission('sync.resolve')
  conflicts(@Query('status') status?: string) {
    return this.sync.conflicts(status ?? 'open');
  }

  @Post('conflicts/:id/resolve')
  @ApiBearerAuth()
  @RequirePermission('sync.resolve')
  resolve(@CurrentPrincipal() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(resolveBody)) body: z.infer<typeof resolveBody>) {
    return this.sync.resolve(p, id, body.resolution, body.note);
  }

  @Get('nodes')
  @ApiBearerAuth()
  @RequirePermission('sync.manage')
  nodes(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'sync.manage', (tx) =>
      rows(
        tx,
        `SELECT node_id, level, admin_unit_path::text AS admin_unit_path, status, last_seen_at, created_at
         FROM sync.nodes WHERE app.path_visible(admin_unit_path) ORDER BY admin_unit_path`,
      ),
    );
  }

  /** Quyi tugunni ro'yxatdan o'tkazish. Token faqat bir marta qaytariladi; bazada faqat xeshi saqlanadi. */
  @Post('nodes')
  @ApiBearerAuth()
  @RequirePermission('sync.manage')
  register(@CurrentPrincipal() p: AuthPrincipal, @Body(new ZodPipe(nodeBody)) body: z.infer<typeof nodeBody>) {
    return this.db.scoped(p, 'sync.manage', async (tx) => {
      const unit = await one<{ path: string; level: string }>(
        tx,
        'SELECT path::text AS path, level FROM organization.administrative_units WHERE id = $1',
        [body.administrative_unit_id],
      );
      if (!unit) throw new NotFoundException('Administrative unit not found');
      if (unit.level !== body.level) throw new ForbiddenException('Node level must match the administrative unit level');
      if (!canAt(p, 'sync.manage', unit.path)) throw new ForbiddenException();
      const token = randomToken('gmn');
      await tx.query(
        'INSERT INTO sync.nodes (node_id, level, admin_unit_path, token_hash) VALUES ($1, $2, $3::ltree, $4)',
        [body.node_id, body.level, unit.path, sha256(token)],
      );
      await this.audit.record(tx, p, { action: 'sync.node_registered', resourceType: 'sync.nodes', data: { node_id: body.node_id, path: unit.path } });
      return { node_id: body.node_id, level: body.level, admin_unit_path: unit.path, token };
    });
  }

  @Post('nodes/:nodeId/disable')
  @ApiBearerAuth()
  @RequirePermission('sync.manage')
  disable(@CurrentPrincipal() p: AuthPrincipal, @Param('nodeId') nodeId: string) {
    return this.db.scoped(p, 'sync.manage', async (tx) => {
      const n = await one<{ path: string }>(
        tx,
        `UPDATE sync.nodes SET status = 'disabled' WHERE node_id = $1 AND app.path_visible(admin_unit_path)
         RETURNING admin_unit_path::text AS path`,
        [nodeId],
      );
      if (!n) throw new NotFoundException();
      if (!canAt(p, 'sync.manage', n.path)) throw new ForbiddenException();
      await this.audit.record(tx, p, { action: 'sync.node_disabled', resourceType: 'sync.nodes', data: { node_id: nodeId } });
      return { disabled: true };
    });
  }
}

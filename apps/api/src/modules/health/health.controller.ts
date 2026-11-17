import { Controller, Get, Headers, Inject, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { APP_CONFIG, AppConfig } from '../../config';
import { Public } from '../../common/auth/public.decorator';
import { safeEqualHex, sha256 } from '../../common/crypto/crypto.service';
import { DbService } from '../../common/db/db.service';
import { registry } from './metrics';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly db: DbService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('health')
  check() {
    return {
      status: 'ok',
      service: 'govmind-api',
      nodeId: this.config.nodeId,
      nodeLevel: this.config.nodeLevel,
      time: new Date().toISOString(),
    };
  }

  /** Tayyorlik: ma'lumotlar bazasi va AI engine holati. AI ishlamasa ham asosiy funksiyalar ishlaydi. */
  @Public()
  @Get('health/ready')
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.db.pool.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    try {
      const res = await fetch(`${this.config.aiEngine.url}/health`, { signal: AbortSignal.timeout(3000) });
      checks.ai_engine = res.ok ? 'ok' : 'degraded';
    } catch {
      checks.ai_engine = 'down';
    }
    if (checks.database !== 'ok') throw new ServiceUnavailableException({ status: 'down', checks });
    return { status: checks.ai_engine === 'ok' ? 'ok' : 'degraded', checks };
  }

  @Public()
  @Get('metrics')
  async metrics(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    if (this.config.metricsToken) {
      const given = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!safeEqualHex(sha256(given), sha256(this.config.metricsToken))) throw new UnauthorizedException();
    }
    await refreshQueueGauges(this.db);
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  }
}

async function refreshQueueGauges(db: DbService) {
  const { syncQueue, deliveriesQueue } = await import('./metrics');
  const r = await db.system(async (tx) => (await tx.query(
    `SELECT (SELECT count(*) FROM sync.sync_events WHERE status IN ('pending','failed'))::int AS sync_pending,
            (SELECT count(*) FROM sync.conflicts WHERE status = 'open')::int AS conflicts,
            (SELECT count(*) FROM core.notification_deliveries WHERE status = 'pending')::int AS notif_pending,
            (SELECT count(*) FROM integration.webhook_deliveries WHERE status = 'pending')::int AS webhook_pending,
            (SELECT count(*) FROM integration.webhook_deliveries WHERE status = 'failed' AND created_at > now() - interval '1 hour')::int AS webhook_failed`,
  )).rows[0]);
  syncQueue.set({ state: 'pending' }, r.sync_pending);
  syncQueue.set({ state: 'conflict' }, r.conflicts);
  deliveriesQueue.set({ kind: 'notification', state: 'pending' }, r.notif_pending);
  deliveriesQueue.set({ kind: 'webhook', state: 'pending' }, r.webhook_pending);
  deliveriesQueue.set({ kind: 'webhook', state: 'failed_1h' }, r.webhook_failed);
}

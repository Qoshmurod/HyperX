import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthPrincipal } from '../../common/auth/principal';
import { CurrentPrincipal, RequirePermission } from '../../common/auth/public.decorator';
import { DbService } from '../../common/db/db.service';
import { isoDate, uuid } from '../../common/http/schemas';
import { ZodPipe } from '../../common/http/zod.pipe';
import { AnalyticsService, defaultPeriod } from './analytics.service';

const dashQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), organization_id: uuid.optional() });

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly db: DbService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('dashboard')
  @RequirePermission('tasks.read')
  dashboard(@CurrentPrincipal() p: AuthPrincipal, @Query(new ZodPipe(dashQuery)) q: z.infer<typeof dashQuery>) {
    const period = q.from && q.to ? { from: q.from, to: q.to } : defaultPeriod(90);
    return this.db.scoped(p, 'tasks.read', async (tx) => ({
      period,
      summary: await this.analytics.summary(tx, period, q.organization_id),
      by_organization: await this.analytics.statusByOrganization(tx, period),
      late_by_organization: await this.analytics.lateByOrganization(tx, period),
      trend: await this.analytics.monthlyTrend(tx, 12),
    }));
  }

  @Get('kpi-overview')
  @RequirePermission('kpi.read')
  kpi(@CurrentPrincipal() p: AuthPrincipal) {
    return this.db.scoped(p, 'kpi.read', async (tx) => ({ behind_plan: await this.analytics.kpiBehindPlan(tx) }));
  }
}

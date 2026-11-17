import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { AuthGuard } from './common/auth/auth.guard';
import { ErrorFilter } from './common/http/error.filter';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { DecisionsModule } from './modules/decisions/decisions.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    CommonModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300) }]),
    HealthModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    TasksModule,
    KpiModule,
    AnalyticsModule,
    AiModule,
    DecisionsModule,
    ReportsModule,
    DocumentsModule,
    NotificationsModule,
    AuditModule,
    IntegrationsModule,
    SyncModule,
  ],
  providers: [
    // Tartib muhim: avval so'rovlar chastotasi, keyin autentifikatsiya (deny by default).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}

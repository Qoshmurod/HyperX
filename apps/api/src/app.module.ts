import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth/auth.guard';
import { HealthModule } from './modules/health/health.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule, OrganizationsModule],
  providers: [
    // Deny by default: @Public() bilan belgilanmagan har bir endpoint autentifikatsiya talab qiladi.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}

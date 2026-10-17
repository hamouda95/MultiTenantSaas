import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SettingsModule } from './modules/settings/settings.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { AuditModule } from './modules/audit/audit.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { TenantContextService } from './common/tenant-context';
import { Request, Response, NextFunction } from 'express';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    IdentityModule,
    TenantsModule,
    SettingsModule,
    EntitlementsModule,
    AuditModule,
    EventsModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Middleware establishing AsyncLocalStorage execution context per HTTP request
    consumer
      .apply((req: Request, _res: Response, next: NextFunction) => {
        const requestId = (req.headers['x-request-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        TenantContextService.run(
          {
            user: { userId: '', email: '', isPlatformAdmin: false },
            requestId,
          },
          () => next(),
        );
      })
      .forRoutes('*');
  }
}

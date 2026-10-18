import { HrModule } from "./modules/hr/hr.module";
import { BusinessModule } from "./modules/business/business.module";
import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { EntitlementsModule } from "./modules/entitlements/entitlements.module";
import { AuditModule } from "./modules/audit/audit.module";
import { EventsModule } from "./modules/events/events.module";
import { HealthModule } from "./modules/health/health.module";
import { TenantContextService } from "./common/tenant-context";
import { Request, Response, NextFunction } from "express";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    DatabaseModule,
    BusinessModule,
    HrModule,
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
  private attempts = new Map<string, { count: number; until: number }>();
  configure(consumer: MiddlewareConsumer) {
    // Middleware establishing AsyncLocalStorage execution context per HTTP request
    consumer
      .apply((req: Request, _res: Response, next: NextFunction) => {
        _res.setHeader("Cache-Control", "no-store");
        _res.setHeader("X-Content-Type-Options", "nosniff");
        if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
          const origin = req.headers.origin;
          const allowed = process.env.WEB_URL || "http://localhost:3000";
          if (
            (origin && origin !== allowed) ||
            (req.headers.cookie?.includes("saas_session=") && !origin)
          ) {
            _res.status(403).json({ message: "Invalid request origin" });
            return;
          }
          if (req.method !== "DELETE" && !req.is("application/json")) {
            _res.status(415).json({ message: "application/json is required" });
            return;
          }
        }
        if (
          req.method === "POST" &&
          /^\/api\/v1\/auth\/(login|register)$/.test(req.path)
        ) {
          const now = Date.now();
          // Per-instance limiter; upstream load balancers should also enforce a shared limit.
          for (const [key, value] of this.attempts)
            if (value.until < now) this.attempts.delete(key);
          const key = req.ip || "unknown";
          const entry = this.attempts.get(key) || {
            count: 0,
            until: now + 60000,
          };
          if (entry.count >= 10 || this.attempts.size > 10000) {
            _res.setHeader("Retry-After", "60");
            _res
              .status(429)
              .json({ message: "Too many authentication attempts" });
            return;
          }
          entry.count++;
          this.attempts.set(key, entry);
        }
        const requestId =
          (req.headers["x-request-id"] as string) ||
          `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        TenantContextService.run(
          {
            user: { userId: "", email: "", isPlatformAdmin: false },
            requestId,
          },
          () => next(),
        );
      })
      .forRoutes("{*splat}");
  }
}

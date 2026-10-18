import { randomUUID } from "node:crypto";
import { TenantContextService } from "../../common/tenant-context";
import { Injectable, NotFoundException, Inject } from "@nestjs/common";
import { RlsPostgresService } from "../../database/rls-postgres.service";
import { TenantSettings } from "@saas/types";

export interface BrandingThemeTokens {
  cssVariables: Record<string, string>;
  settings: TenantSettings;
}

@Injectable()
export class SettingsService {
  constructor(
    @Inject(RlsPostgresService) private readonly rlsDb: RlsPostgresService,
  ) {}

  /**
   * Retrieves tenant settings and calculates design token CSS variables.
   */
  async getSettings(tenantId: string): Promise<BrandingThemeTokens> {
    const res = await this.rlsDb.queryInTenantContext<TenantSettings>(
      tenantId,
      `SELECT id, tenant_id as "tenantId", logo_url as "logoUrl",
              primary_color as "primaryColor", accent_color as "accentColor",
              theme_mode as "themeMode", custom_domain as "customDomain",
              metadata, created_at as "createdAt", updated_at as "updatedAt"
       FROM tenant_settings
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const settings = res.rows[0];
    if (!settings) {
      throw new NotFoundException(`Settings for tenant ${tenantId} not found`);
    }

    const cssVariables = {
      "--brand-primary": settings.primaryColor,
      "--brand-accent": settings.accentColor,
      "--theme-mode": settings.themeMode,
    };

    return { settings, cssVariables };
  }

  /**
   * Updates tenant settings within the transaction-local tenant context.
   */
  async updateSettings(
    tenantId: string,
    data: Partial<
      Pick<
        TenantSettings,
        | "logoUrl"
        | "primaryColor"
        | "accentColor"
        | "themeMode"
        | "customDomain"
      >
    >,
  ): Promise<TenantSettings> {
    const updates: string[] = [];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (data.logoUrl !== undefined) {
      updates.push(`logo_url = $${paramIndex++}`);
      params.push(data.logoUrl);
    }
    if (data.primaryColor) {
      updates.push(`primary_color = $${paramIndex++}`);
      params.push(data.primaryColor);
    }
    if (data.accentColor) {
      updates.push(`accent_color = $${paramIndex++}`);
      params.push(data.accentColor);
    }
    if (data.themeMode) {
      updates.push(`theme_mode = $${paramIndex++}`);
      params.push(data.themeMode);
    }
    if (data.customDomain !== undefined) {
      updates.push(`custom_domain = $${paramIndex++}`);
      params.push(data.customDomain);
    }

    updates.push(`updated_at = NOW()`);

    const sql = `UPDATE tenant_settings
                 SET ${updates.join(", ")}
                 WHERE tenant_id = $1
                 RETURNING id, tenant_id as "tenantId", logo_url as "logoUrl",
                           primary_color as "primaryColor", accent_color as "accentColor",
                           theme_mode as "themeMode", custom_domain as "customDomain",
                           metadata, created_at as "createdAt", updated_at as "updatedAt"`;

    return this.rlsDb.runInTenantContext(tenantId, async (client) => {
      const res = await client.query<TenantSettings>(sql, params);

      if (!res.rows[0]) {
        throw new NotFoundException(`Tenant settings not found for update`);
      }

      await client.query(
        `INSERT INTO audit_logs (id,tenant_id,actor_id,action,resource_type,resource_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          randomUUID(),
          tenantId,
          TenantContextService.get()?.user?.userId || null,
          "settings.updated",
          "settings",
          tenantId,
        ],
      );
      return res.rows[0];
    });
  }
}

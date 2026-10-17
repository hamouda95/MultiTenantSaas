import { TenantContextService } from '../../common/tenant-context';
import { randomUUID } from 'node:crypto';
import { Injectable, ForbiddenException, NotFoundException, Inject } from '@nestjs/common';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { TenantModule, TenantQuota } from '@saas/types';

@Injectable()
export class EntitlementsService {
  constructor(@Inject(RlsPostgresService) private readonly rlsDb: RlsPostgresService) {}

  /**
   * Retrieves all modules and their enabled state for the tenant.
   */
  async getTenantModules(tenantId: string): Promise<TenantModule[]> {
    const res = await this.rlsDb.queryInTenantContext<TenantModule>(
      tenantId,
      `SELECT id, tenant_id as "tenantId", module_key as "moduleKey",
              is_enabled as "isEnabled", configuration, created_at as "createdAt", updated_at as "updatedAt"
       FROM tenant_modules
       WHERE tenant_id = $1`,
      [tenantId],
    );
    return res.rows;
  }

  /**
   * Toggles or updates a module's entitlement for the tenant.
   */
  async toggleModule(
    tenantId: string,
    moduleKey: string,
    isEnabled: boolean,
    configuration: Record<string, unknown> = {},
  ): Promise<TenantModule> {
    return this.rlsDb.runInTenantContext(tenantId, async client => {
    const res = await client.query<TenantModule>(
      `INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled, configuration)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, module_key)
       DO UPDATE SET is_enabled = EXCLUDED.is_enabled, configuration = EXCLUDED.configuration, updated_at = NOW()
       RETURNING id, tenant_id as "tenantId", module_key as "moduleKey", is_enabled as "isEnabled", configuration, created_at as "createdAt", updated_at as "updatedAt"`,
      [randomUUID(), tenantId, moduleKey, isEnabled, JSON.stringify(configuration)],
    );
    await client.query(`INSERT INTO audit_logs (id,tenant_id,actor_id,action,resource_type,resource_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), tenantId, TenantContextService.get()?.user?.userId || null, 'module.updated', 'module', tenantId]);
    return res.rows[0];
    });
  }

  /**
   * Check whether a specific module is entitled and enabled for the tenant.
   */
  async isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const res = await this.rlsDb.queryInTenantContext<{ is_enabled: boolean }>(
      tenantId,
      `SELECT is_enabled FROM tenant_modules WHERE tenant_id = $1 AND module_key = $2`,
      [tenantId, moduleKey],
    );
    return Boolean(res.rows[0]?.is_enabled);
  }

  /**
   * Retrieves quota limits and current consumption for the tenant.
   */
  async getQuota(tenantId: string): Promise<TenantQuota> {
    const res = await this.rlsDb.queryInTenantContext<TenantQuota>(
      tenantId,
      `SELECT id, tenant_id as "tenantId",
              monthly_ai_token_budget as "monthlyAiTokenBudget",
              monthly_ai_cost_budget as "monthlyAiCostBudget",
              max_members as "maxMembers",
              max_storage_bytes as "maxStorageBytes",
              current_ai_tokens_used as "currentAiTokensUsed",
              current_ai_cost_used as "currentAiCostUsed",
              reset_cycle_date as "resetCycleDate",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM tenant_quotas
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const quota = res.rows[0];
    if (!quota) {
      throw new NotFoundException(`Quotas not found for tenant ${tenantId}`);
    }
    return quota;
  }

  /**
   * Pre-execution budget gate: throws ForbiddenException if the requested usage would exceed tenant limits.
   */
  async checkAiBudget(tenantId: string, estimatedTokens = 1000, estimatedCost = 0.02): Promise<boolean> {
    const quota = await this.getQuota(tenantId);

    const tokenBudgetExceeded =
      Number(quota.currentAiTokensUsed) + estimatedTokens > Number(quota.monthlyAiTokenBudget);
    const costBudgetExceeded =
      Number(quota.currentAiCostUsed) + estimatedCost > Number(quota.monthlyAiCostBudget);

    if (tokenBudgetExceeded || costBudgetExceeded) {
      throw new ForbiddenException(
        `AI consumption budget exceeded for tenant. Current tokens: ${quota.currentAiTokensUsed}/${quota.monthlyAiTokenBudget}, cost: $${quota.currentAiCostUsed}/$${quota.monthlyAiCostBudget}`,
      );
    }

    return true;
  }

  /**
   * Atomically records usage consumption into the quota counter.
   */
  async recordAiConsumption(tenantId: string, tokensUsed: number, costIncurred: number): Promise<void> {
    await this.rlsDb.queryInTenantContext(
      tenantId,
      `UPDATE tenant_quotas
       SET current_ai_tokens_used = current_ai_tokens_used + $1,
           current_ai_cost_used = current_ai_cost_used + $2,
           updated_at = NOW()
       WHERE tenant_id = $3`,
      [tokensUsed, costIncurred, tenantId],
    );
  }
}

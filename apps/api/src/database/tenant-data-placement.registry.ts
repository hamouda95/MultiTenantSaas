import { Injectable, Logger } from '@nestjs/common';
import { DataPlacementMode, TenantDataPlacement } from '@saas/types';
import { Pool } from 'pg';

export interface TenantDatabaseConnection {
  tenantId: string;
  placementMode: DataPlacementMode;
  pool: Pool | null;
  schemaName: string;
  region: string;
}

@Injectable()
export class TenantDataPlacementRegistry {
  private readonly logger = new Logger(TenantDataPlacementRegistry.name);
  private readonly placements: Map<string, TenantDataPlacement> = new Map();
  private readonly dedicatedPools: Map<string, Pool> = new Map();

  constructor() {
    this.logger.log('Initialized TenantDataPlacementRegistry for hybrid database placement');
  }

  /**
   * Register or update tenant placement configuration.
   */
  public registerPlacement(placement: TenantDataPlacement) {
    this.placements.set(placement.tenantId, placement);
    this.logger.log(
      `Registered placement for tenant ${placement.tenantId} (mode: ${placement.placementMode}, region: ${placement.region})`,
    );
  }

  /**
   * Retrieve placement metadata for a given tenant.
   */
  public getPlacement(tenantId: string): TenantDataPlacement {
    return (
      this.placements.get(tenantId) || {
        id: `default-placement-${tenantId}`,
        tenantId,
        placementMode: 'SHARED',
        schemaName: 'public',
        region: 'eu-central-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );
  }

  /**
   * Resolve database connection routing for a verified tenant.
   */
  public async resolveConnection(tenantId: string): Promise<TenantDatabaseConnection> {
    const placement = this.getPlacement(tenantId);

    if (placement.placementMode === 'DEDICATED') {
      let pool = this.dedicatedPools.get(tenantId) || null;

      if (!pool && placement.connectionUrlSecretName) {
        // In production, fetch connection string securely from KMS / Secret Manager
        const dedicatedUrl = process.env.DEDICATED_DATABASE_URL;
        if (dedicatedUrl) {
          pool = new Pool({
            connectionString: dedicatedUrl,
            max: 10,
            idleTimeoutMillis: 30000,
          });
          this.dedicatedPools.set(tenantId, pool);
          this.logger.log(`Created dedicated database pool for enterprise tenant ${tenantId}`);
        }
      }

      return {
        tenantId,
        placementMode: 'DEDICATED',
        pool,
        schemaName: placement.schemaName,
        region: placement.region,
      };
    }

    // Default: Shared placement
    return {
      tenantId,
      placementMode: 'SHARED',
      pool: null, // Indicates fallback to standard RlsPostgresService shared pool
      schemaName: 'public',
      region: placement.region,
    };
  }

  public async closeAllDedicatedPools() {
    for (const [tenantId, pool] of this.dedicatedPools.entries()) {
      await pool.end().catch(() => null);
      this.logger.log(`Closed dedicated database pool for tenant ${tenantId}`);
    }
    this.dedicatedPools.clear();
  }
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TenantDataPlacementRegistry } from '../src/database/tenant-data-placement.registry';
import { TenantDataPlacement } from '@saas/types';

describe('TenantDataPlacementRegistry (Hybrid Database Architecture)', () => {
  let registry: TenantDataPlacementRegistry;

  beforeEach(() => {
    registry = new TenantDataPlacementRegistry();
  });

  afterEach(async () => {
    await registry.closeAllDedicatedPools();
  });

  it('should default unspecified tenants to SHARED placement mode', async () => {
    const connection = await registry.resolveConnection('tenant-standard-001');

    expect(connection.placementMode).toBe('SHARED');
    expect(connection.pool).toBeNull(); // Uses shared default connection pool
    expect(connection.schemaName).toBe('public');
    expect(connection.region).toBe('eu-central-1');
  });

  it('should route enterprise tenants with registered DEDICATED placement mode', async () => {
    const enterprisePlacement: TenantDataPlacement = {
      id: 'plc-enterprise-999',
      tenantId: 'tenant-enterprise-999',
      placementMode: 'DEDICATED',
      connectionUrlSecretName: 'vault/secrets/tenant-999-db',
      schemaName: 'public',
      region: 'eu-west-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    registry.registerPlacement(enterprisePlacement);

    const connection = await registry.resolveConnection('tenant-enterprise-999');

    expect(connection.placementMode).toBe('DEDICATED');
    expect(connection.region).toBe('eu-west-1');
    expect(connection.tenantId).toBe('tenant-enterprise-999');
  });

  it('should preserve independent placements across multiple tenants', async () => {
    registry.registerPlacement({
      id: 'plc-1',
      tenantId: 'tenant-dedicated-1',
      placementMode: 'DEDICATED',
      schemaName: 'public',
      region: 'eu-central-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    registry.registerPlacement({
      id: 'plc-2',
      tenantId: 'tenant-shared-2',
      placementMode: 'SHARED',
      schemaName: 'public',
      region: 'eu-west-3',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const conn1 = await registry.resolveConnection('tenant-dedicated-1');
    const conn2 = await registry.resolveConnection('tenant-shared-2');

    expect(conn1.placementMode).toBe('DEDICATED');
    expect(conn2.placementMode).toBe('SHARED');
    expect(conn2.region).toBe('eu-west-3');
  });
});

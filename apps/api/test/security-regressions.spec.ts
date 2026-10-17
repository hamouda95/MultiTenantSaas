import { describe, it, expect, beforeEach } from 'vitest';
import { ZodValidationPipe } from '../src/common/pipes/zod-validation.pipe';
import { CreateTenantDtoSchema } from '../src/common/dto/tenant.dto';
import { UpdateSettingsDtoSchema } from '../src/common/dto/settings.dto';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { TenantDataPlacementRegistry } from '../src/database/tenant-data-placement.registry';
import { RlsPostgresService } from '../src/database/rls-postgres.service';
import { TenantContextService } from '../src/common/tenant-context';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('Security & Architecture Regression Tests', () => {
  let db: RlsPostgresService;
  let placementRegistry: TenantDataPlacementRegistry;
  let tenantsService: TenantsService;

  beforeEach(() => {
    db = new RlsPostgresService();
    db.setInMemoryMode(true);
    placementRegistry = new TenantDataPlacementRegistry();
    tenantsService = new TenantsService(db, placementRegistry);
  });

  describe('Regression 1: Input Validation & Sanitization (ZodValidationPipe)', () => {
    const tenantPipe = new ZodValidationPipe(CreateTenantDtoSchema);
    const settingsPipe = new ZodValidationPipe(UpdateSettingsDtoSchema);

    it('should reject tenant creation with invalid slugs (uppercase, symbols, or script tags)', () => {
      expect(() =>
        tenantPipe.transform({
          name: 'Acme',
          slug: 'ACME_CORP!',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        tenantPipe.transform({
          name: 'Acme',
          slug: '<script>alert(1)</script>',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        tenantPipe.transform({
          name: 'Acme',
          slug: 'invalid slug with spaces',
        }),
      ).toThrow(BadRequestException);
    });

    it('should accept valid lowercase alphanumeric hyphenated slugs', () => {
      const valid = tenantPipe.transform({
        name: 'Acme International',
        slug: 'acme-international-123',
        primaryColor: '#4F46E5',
      });
      expect(valid.slug).toBe('acme-international-123');
      expect(valid.primaryColor).toBe('#4F46E5');
    });

    it('should reject settings update with malicious or invalid hex colors', () => {
      expect(() =>
        settingsPipe.transform({
          primaryColor: 'javascript:alert(1)',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        settingsPipe.transform({
          primaryColor: '#ZZZZZZ',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject invalid custom domain formats containing protocols or paths', () => {
      expect(() =>
        settingsPipe.transform({
          customDomain: 'https://evil.com/phishing',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        settingsPipe.transform({
          customDomain: 'invalid domain with spaces',
        }),
      ).toThrow(BadRequestException);
    });

    it('should accept valid custom domains and hex colors', () => {
      const valid = settingsPipe.transform({
        primaryColor: '#10B981',
        accentColor: '#3B82F6',
        customDomain: 'portal.acme-corp.com',
        themeMode: 'DARK',
      });
      expect(valid.primaryColor).toBe('#10B981');
      expect(valid.customDomain).toBe('portal.acme-corp.com');
    });
  });

  describe('Regression 2: Enterprise Dedicated Database Placement Gate', () => {
    it('should throw ForbiddenException if a standard user requests DEDICATED placement mode', async () => {
      // Execute in standard non-platform-admin context
      await TenantContextService.run(
        {
          user: { userId: 'usr-standard', email: 'user@standard.io', isPlatformAdmin: false },
          requestId: 'req-gate-1',
        },
        async () => {
          await expect(
            tenantsService.createTenant({
              name: 'Unauthorized Dedicated Tenant',
              slug: 'unauthorized-dedicated',
              creatorUserId: 'usr-standard',
              placementMode: 'DEDICATED',
            }),
          ).rejects.toThrow(ForbiddenException);
        },
      );
    });

    it('should allow platform administrators to provision DEDICATED enterprise placement mode', async () => {
      await TenantContextService.run(
        {
          user: { userId: 'usr-admin', email: 'ops@platform.saas', isPlatformAdmin: true },
          requestId: 'req-gate-2',
        },
        async () => {
          const { tenant, placement } = await tenantsService.createTenant({
            name: 'Authorized Enterprise Tenant',
            slug: 'authorized-enterprise',
            creatorUserId: 'usr-admin',
            placementMode: 'DEDICATED',
          });

          expect(tenant.slug).toBe('authorized-enterprise');
          expect(placement.placementMode).toBe('DEDICATED');
        },
      );
    });
  });

  describe('Regression 3: Tenant Creator Owner Role & Permission Association', () => {
    it('should seed standard permissions and associate them with the Owner role during provisioning', async () => {
      const { tenant } = await tenantsService.createTenant({
        name: 'Omega Systems',
        slug: 'omega-systems',
        creatorUserId: 'usr-omega-founder',
        placementMode: 'SHARED',
      });

      // Query roles for the newly provisioned tenant
      const rolesRes = await db.queryInTenantContext(
        tenant.id,
        'SELECT id, name FROM roles WHERE tenant_id = $1',
        [tenant.id],
      );

      expect(rolesRes.rows.some((r: any) => r.name === 'Owner')).toBe(true);

      // Verify that membership_roles recorded tenant_id for RLS enforcement
      const memRoles = db.getInMemoryDataStore().get('membership_roles');
      expect(memRoles).toBeDefined();
      const tenantMemRoles = (memRoles?.get(tenant.id) || []) as any[];
      expect(tenantMemRoles.length).toBeGreaterThan(0);
      expect(tenantMemRoles[0].tenant_id).toBe(tenant.id);
    });
  });

  describe('Regression 4: Cross-Tenant Role Tampering Prevention', () => {
    it('should isolate membership roles strictly by tenant ID', async () => {
      const TENANT_X = '10000000-0000-0000-0000-000000000001';
      const TENANT_Y = '20000000-0000-0000-0000-000000000002';

      // Tenant X assigns role
      await db.runInTenantContext(TENANT_X, async (client) => {
        await client.query(
          `INSERT INTO membership_roles (tenant_id, membership_id, role_id)
           VALUES ($1, $2, $3)`,
          [TENANT_X, 'mem-x', 'rol-x-admin'],
        );
      });

      // Tenant Y queries membership_roles
      const tenantYQuery = await db.runInTenantContext(TENANT_Y, async (client) => {
        return client.query('SELECT * FROM membership_roles');
      });

      // Tenant Y must see 0 rows
      expect(tenantYQuery.rows).toHaveLength(0);
    });
  });
});

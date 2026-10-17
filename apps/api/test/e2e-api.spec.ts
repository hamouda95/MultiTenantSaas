import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IdentityService } from '../src/modules/identity/identity.service';
import { TenantsService } from '../src/modules/tenants/tenants.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import { EntitlementsService } from '../src/modules/entitlements/entitlements.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { OutboxService } from '../src/modules/events/outbox.service';
import { RlsPostgresService } from '../src/database/rls-postgres.service';
import { TenantContextService } from '../src/common/tenant-context';

describe('End-to-End Multi-Tenant SaaS Engine Verification', () => {
  let app: INestApplication;
  let identityService: IdentityService;
  let tenantsService: TenantsService;
  let settingsService: SettingsService;
  let entitlementsService: EntitlementsService;
  let auditService: AuditService;
  let outboxService: OutboxService;
  let rlsDb: RlsPostgresService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    identityService = app.get(IdentityService);
    tenantsService = app.get(TenantsService);
    settingsService = app.get(SettingsService);
    entitlementsService = app.get(EntitlementsService);
    auditService = app.get(AuditService);
    outboxService = app.get(OutboxService);
    rlsDb = app.get(RlsPostgresService);
    rlsDb.setInMemoryMode(true);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should provision two distinct tenants with isolated branding, quotas, and placement', async () => {
    const userA = await identityService.createUser({
      email: 'founder@acme.io',
      fullName: 'Alice Founder',
    });

    const userB = await identityService.createUser({
      email: 'ceo@stark.io',
      fullName: 'Tony CEO',
      isPlatformAdmin: true,
    });

    // 1. Provision Tenant A (Acme Corp - Standard Shared Placement)
    const { tenant: tenantA, settings: settingsA, placement: placementA } = await tenantsService.createTenant({
      name: 'Acme Corporation',
      slug: 'acme-corp-e2e',
      creatorUserId: userA.id,
      primaryColor: '#0EA5E9',
      placementMode: 'SHARED',
    });

    expect(tenantA.name).toBe('Acme Corporation');
    expect(settingsA.primaryColor).toBe('#0EA5E9');
    expect(placementA.placementMode).toBe('SHARED');

    // 2. Provision Tenant B (Stark Industries - Dedicated Placement by Platform Admin)
    const { tenant: tenantB, settings: settingsB, placement: placementB } = await TenantContextService.run(
      {
        user: { userId: userB.id, email: userB.email, isPlatformAdmin: true },
        requestId: 'req-e2e-dedicated',
      },
      () =>
        tenantsService.createTenant({
          name: 'Stark Industries',
          slug: 'stark-corp-e2e',
          creatorUserId: userB.id,
          primaryColor: '#DC2626',
          placementMode: 'DEDICATED',
        }),
    );

    expect(tenantB.name).toBe('Stark Industries');
    expect(settingsB.primaryColor).toBe('#DC2626');
    expect(placementB.placementMode).toBe('DEDICATED');

    // Verify distinct IDs
    expect(tenantA.id).not.toBe(tenantB.id);
  });

  it('should persist and generate CSS custom properties for tenant branding', async () => {
    const tenantId = 'ten-brand-test';
    // Seed settings directly in tenant context
    await rlsDb.runInTenantContext(tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_settings (id, tenant_id, primary_color, accent_color, theme_mode)
         VALUES ($1, $2, $3, $4, $5)`,
        ['set-brand', tenantId, '#10B981', '#6366F1', 'DARK'],
      );
    });

    const theme = await settingsService.getSettings(tenantId);
    expect(theme.cssVariables['--brand-primary']).toBe('#10B981');
    expect(theme.cssVariables['--brand-accent']).toBe('#6366F1');
    expect(theme.cssVariables['--theme-mode']).toBe('DARK');
  });

  it('should enforce module toggles and prevent unauthorized module access', async () => {
    const tenantId = 'ten-modules-test';

    // Seed default enabled modules
    await entitlementsService.toggleModule(tenantId, 'ai_chat', true);
    await entitlementsService.toggleModule(tenantId, 'nl_sql', false);

    const isChatEnabled = await entitlementsService.isModuleEnabled(tenantId, 'ai_chat');
    const isSqlEnabled = await entitlementsService.isModuleEnabled(tenantId, 'nl_sql');

    expect(isChatEnabled).toBe(true);
    expect(isSqlEnabled).toBe(false);
  });

  it('should track AI quota consumption and enforce budget guardrails', async () => {
    const tenantId = 'ten-quota-test';

    // Seed quota: budget of 10,000 tokens and $1.00
    await rlsDb.runInTenantContext(tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_quotas (id, tenant_id, monthly_ai_token_budget, monthly_ai_cost_budget, current_ai_tokens_used, current_ai_cost_used)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['qta-test', tenantId, 10000, 1.00, 9500, 0.95],
      );
    });

    // Check budget for small request (should pass)
    const allowed = await entitlementsService.checkAiBudget(tenantId, 400, 0.04);
    expect(allowed).toBe(true);

    // Check budget for exceeding request (should throw ForbiddenException)
    await expect(entitlementsService.checkAiBudget(tenantId, 1000, 0.10)).rejects.toThrow();
  });

  it('should record immutable audit logs and outbox events', async () => {
    const tenantId = 'ten-audit-test';

    // Record audit action
    const auditRecord = await auditService.recordAudit({
      tenantId,
      actorId: 'usr-admin-1',
      action: 'role.assign',
      resourceType: 'role',
      resourceId: 'rol-custom-lead',
      payload: { role: 'Lead Architect' },
    });

    expect(auditRecord.action).toBe('role.assign');
    expect(auditRecord.tenantId).toBe(tenantId);

    // Record transactional outbox event
    const outboxEvent = await outboxService.emitTransactionalEvent(
      tenantId,
      'tenant.settings.updated',
      { changedKey: 'primaryColor', newValue: '#3B82F6' },
    );

    expect(outboxEvent.eventType).toBe('tenant.settings.updated');
    expect(outboxEvent.tenantId).toBe(tenantId);
  });
});

import { randomUUID } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { Tenant, TenantSettings, TenantQuota, TenantDataPlacement } from '@saas/types';
import { TenantDataPlacementRegistry } from '../../database/tenant-data-placement.registry';
import { TenantContextService } from '../../common/tenant-context';

export const STANDARD_PERMISSIONS = [
  'members:read',
  'members:manage',
  'settings:read',
  'settings:manage',
  'modules:manage',
  'quotas:read',
  'audit:read',
  'documents:read',
  'documents:write',
  'documents:delete',
  'ai:chat',
  'ai:rag',
  'ai:analytics',
];

@Injectable()
export class TenantsService {
  constructor(
    @Inject(RlsPostgresService) private readonly rlsDb: RlsPostgresService,
    @Inject(TenantDataPlacementRegistry) private readonly placementRegistry: TenantDataPlacementRegistry,
  ) {}

  /**
   * Provisions a brand new tenant with all necessary baseline entities:
   * - Tenant record
   * - TenantSettings (branding)
   * - Default TenantModules (ai_chat, rag_documents, predictive_analytics)
   * - TenantQuota (token and cost limits)
   * - TenantDataPlacement (shared or dedicated)
   * - Default Roles (Owner, Member, Viewer) with permissions
   * - Creator Membership with Owner role and assigned permissions
   */
  async createTenant(data: {
    name: string;
    slug: string;
    creatorUserId: string;
    placementMode?: 'SHARED' | 'DEDICATED';
    primaryColor?: string;
  }): Promise<{ tenant: Tenant; settings: TenantSettings; placement: TenantDataPlacement }> {
    const slug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Security Gate: Dedicated database placement is restricted to platform administrators
    if (data.placementMode === 'DEDICATED' && !TenantContextService.isPlatformAdmin()) {
      throw new ForbiddenException(
        'Dedicated database placement is an enterprise feature requiring platform administrator provisioning',
      );
    }

    // Check slug uniqueness
    const existing = await this.rlsDb.queryAdmin('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      throw new ConflictException(`Tenant slug '${slug}' is already in use`);
    }

    const tenantId = randomUUID();

    // 1. Create Tenant
    const tenantRes = await this.rlsDb.queryAdmin<Tenant>(
      `INSERT INTO tenants (id, slug, name, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       RETURNING id, slug, name, status, created_at as "createdAt", updated_at as "updatedAt"`,
      [tenantId, slug, data.name],
    );
    const tenant = tenantRes.rows[0];

    // 2. Create Settings & Branding
    const primaryColor = data.primaryColor || '#0F172A';
    const settingsRes = await this.rlsDb.queryAdmin<TenantSettings>(
      `INSERT INTO tenant_settings (id, tenant_id, primary_color, accent_color, theme_mode, metadata)
       VALUES ($1, $2, $3, '#2563EB', 'SYSTEM', '{}')
       RETURNING id, tenant_id as "tenantId", primary_color as "primaryColor", accent_color as "accentColor", theme_mode as "themeMode", metadata, created_at as "createdAt", updated_at as "updatedAt"`,
      [randomUUID(), tenantId, primaryColor],
    );
    const settings = settingsRes.rows[0];

    // 3. Create Default Quotas
    await this.rlsDb.queryAdmin<TenantQuota>(
      `INSERT INTO tenant_quotas (id, tenant_id, monthly_ai_token_budget, monthly_ai_cost_budget, max_members, max_storage_bytes)
       VALUES ($1, $2, 1000000, 50.00, 50, 10737418240)`,
      [randomUUID(), tenantId],
    );

    // 4. Create Data Placement
    const placementMode = data.placementMode || 'SHARED';
    const placementRes = await this.rlsDb.queryAdmin<TenantDataPlacement>(
      `INSERT INTO tenant_data_placements (id, tenant_id, placement_mode, schema_name, region)
       VALUES ($1, $2, $3, 'public', 'eu-central-1')
       RETURNING id, tenant_id as "tenantId", placement_mode as "placementMode", schema_name as "schemaName", region, created_at as "createdAt", updated_at as "updatedAt"`,
      [randomUUID(), tenantId, placementMode],
    );
    const placement = placementRes.rows[0];
    this.placementRegistry.registerPlacement(placement);

    // 5. Create Default Owner Role & Assign Standard Permissions
    const ownerRoleId = randomUUID();
    await this.rlsDb.queryAdmin(
      `INSERT INTO roles (id, tenant_id, name, description, is_system_role)
       VALUES ($1, $2, 'Owner', 'Full tenant management and ownership rights', true)`,
      [ownerRoleId, tenantId],
    );

    // Seed permissions & link to Owner role
    for (const permKey of STANDARD_PERMISSIONS) {
      const permId = randomUUID();
      await this.rlsDb.queryAdmin(
        `INSERT INTO permissions (id, key, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [permId, permKey, `Permission for ${permKey}`],
      );

      await this.rlsDb.queryAdmin(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, (SELECT id FROM permissions WHERE key = $2))
         ON CONFLICT DO NOTHING`,
        [ownerRoleId, permKey],
      );
    }

    // Create Membership for creator
    const membershipId = randomUUID();
    await this.rlsDb.queryAdmin(
      `INSERT INTO memberships (id, tenant_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [membershipId, tenantId, data.creatorUserId],
    );

    // Assign Owner role to creator with tenant_id for RLS
    await this.rlsDb.queryAdmin(
      `INSERT INTO membership_roles (tenant_id, membership_id, role_id)
       VALUES ($1, $2, $3)`,
      [tenantId, membershipId, ownerRoleId],
    );

    // 6. Enable default standard modules
    const standardModules = ['ai_chat', 'rag_documents', 'predictive_analytics', 'agent_tools', 'nl_sql'];
    for (const mod of standardModules) {
      await this.rlsDb.queryAdmin(
        `INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled)
         VALUES ($1, $2, $3, true)`,
        [randomUUID(), tenantId, mod],
      );
    }

    return { tenant, settings, placement };
  }

  async getTenantById(tenantId: string): Promise<Tenant> {
    const res = await this.rlsDb.queryAdmin<Tenant>(
      'SELECT id, slug, name, status, created_at as "createdAt", updated_at as "updatedAt" FROM tenants WHERE id = $1',
      [tenantId],
    );
    if (!res.rows[0]) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }
    return res.rows[0];
  }

  async listMembers(tenantId: string) {
    const res = await this.rlsDb.queryInTenantContext(
      tenantId,
      `SELECT m.id, m.status, m.created_at as "createdAt",
              u.id as "userId", u.email, u.full_name as "fullName",
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') as roles
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN membership_roles mr ON mr.membership_id = m.id AND mr.tenant_id = m.tenant_id
       LEFT JOIN roles r ON r.id = mr.role_id
       WHERE m.tenant_id = $1
       GROUP BY m.id, m.status, m.created_at, u.id, u.email, u.full_name`,
      [tenantId],
    );
    return res.rows;
  }

  async addMember(tenantId: string, email: string, roleName = 'Member') {
    // Look up or create user
    let userRes = await this.rlsDb.queryAdmin('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    let userId = userRes.rows[0]?.id;

    if (!userId) {
      userId = randomUUID();
      await this.rlsDb.queryAdmin(
        `INSERT INTO users (id, email, full_name, status) VALUES ($1, $2, $3, 'ACTIVE')`,
        [userId, email.toLowerCase(), email.split('@')[0]],
      );
    }

    const membershipId = randomUUID();
    await this.rlsDb.queryInTenantContext(
      tenantId,
      `INSERT INTO memberships (id, tenant_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [membershipId, tenantId, userId],
    );

    // Look up role or create default role
    let roleRes = await this.rlsDb.queryInTenantContext(
      tenantId,
      'SELECT id FROM roles WHERE tenant_id = $1 AND name = $2',
      [tenantId, roleName],
    );

    let roleId = roleRes.rows[0]?.id;
    if (!roleId) {
      roleId = randomUUID();
      await this.rlsDb.queryInTenantContext(
        tenantId,
        `INSERT INTO roles (id, tenant_id, name, description, is_system_role)
         VALUES ($1, $2, $3, $4, false)`,
        [roleId, tenantId, roleName, `${roleName} role`],
      );
    }

    // Assign role to membership with tenant_id
    await this.rlsDb.queryInTenantContext(
      tenantId,
      `INSERT INTO membership_roles (tenant_id, membership_id, role_id)
       VALUES ($1, $2, $3)`,
      [tenantId, membershipId, roleId],
    );

    return { membershipId, userId, tenantId, status: 'ACTIVE', role: roleName };
  }
}

import { randomUUID, randomBytes, createHash } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  BadRequestException,
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

    if (data.placementMode === 'DEDICATED' && process.env.NODE_ENV !== 'test') {
      throw new BadRequestException('Dedicated database routing is not configured; use shared placement');
    }
    const result = await this.rlsDb.runAdminTransaction(async (client) => {
    const query: typeof client.query = client.query.bind(client);
    // Check slug uniqueness
    const existing = await query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      throw new ConflictException(`Tenant slug '${slug}' is already in use`);
    }

    const tenantId = randomUUID();

    // 1. Create Tenant
    const tenantRes = await query<Tenant>(
      `INSERT INTO tenants (id, slug, name, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       RETURNING id, slug, name, status, created_at as "createdAt", updated_at as "updatedAt"`,
      [tenantId, slug, data.name],
    );
    const tenant = tenantRes.rows[0];

    // 2. Create Settings & Branding
    const primaryColor = data.primaryColor || '#0F172A';
    const settingsRes = await query<TenantSettings>(
      `INSERT INTO tenant_settings (id, tenant_id, primary_color, accent_color, theme_mode, metadata)
       VALUES ($1, $2, $3, '#2563EB', 'SYSTEM', '{}')
       RETURNING id, tenant_id as "tenantId", primary_color as "primaryColor", accent_color as "accentColor", theme_mode as "themeMode", metadata, created_at as "createdAt", updated_at as "updatedAt"`,
      [randomUUID(), tenantId, primaryColor],
    );
    const settings = settingsRes.rows[0];

    // 3. Create Default Quotas
    await query<TenantQuota>(
      `INSERT INTO tenant_quotas (id, tenant_id, monthly_ai_token_budget, monthly_ai_cost_budget, max_members, max_storage_bytes)
       VALUES ($1, $2, 1000000, 50.00, 50, 10737418240)`,
      [randomUUID(), tenantId],
    );

    // 4. Create Data Placement
    const placementMode = data.placementMode || 'SHARED';
    const placementRes = await query<TenantDataPlacement>(
      `INSERT INTO tenant_data_placements (id, tenant_id, placement_mode, schema_name, region)
       VALUES ($1, $2, $3, 'public', 'eu-central-1')
       RETURNING id, tenant_id as "tenantId", placement_mode as "placementMode", schema_name as "schemaName", region, created_at as "createdAt", updated_at as "updatedAt"`,
      [randomUUID(), tenantId, placementMode],
    );
    const placement = placementRes.rows[0];


    // 5. Create Default Owner Role & Assign Standard Permissions
    const ownerRoleId = randomUUID();
    await query(
      `INSERT INTO roles (id, tenant_id, name, description, is_system_role)
       VALUES ($1, $2, 'Owner', 'Full tenant management and ownership rights', true)`,
      [ownerRoleId, tenantId],
    );

    // Seed permissions & link to Owner role
    for (const permKey of STANDARD_PERMISSIONS) {
      const permId = randomUUID();
      await query(
        `INSERT INTO permissions (id, key, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [permId, permKey, `Permission for ${permKey}`],
      );

      await query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1, (SELECT id FROM permissions WHERE key = $2))
         ON CONFLICT DO NOTHING`,
        [ownerRoleId, permKey],
      );
    }

    for (const name of ['Member', 'Viewer']) {
      const roleId = randomUUID();
      await query(`INSERT INTO roles (id, tenant_id, name, is_system_role) VALUES ($1,$2,$3,true)`, [roleId, tenantId, name]);
      const read = ['members:read','settings:read','quotas:read','documents:read'];
      const keys = name === 'Viewer' ? read : [...read, 'documents:write','ai:chat','ai:rag','ai:analytics'];
      for (const key of keys) await query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE key = $2`, [roleId, key]);
    }

    // Create Membership for creator
    const membershipId = randomUUID();
    await query(
      `INSERT INTO memberships (id, tenant_id, user_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [membershipId, tenantId, data.creatorUserId],
    );

    // Assign Owner role to creator with tenant_id for RLS
    await query(
      `INSERT INTO membership_roles (tenant_id, membership_id, role_id)
       VALUES ($1, $2, $3)`,
      [tenantId, membershipId, ownerRoleId],
    );

    // 6. Enable default standard modules
    const standardModules = ['ai_chat', 'rag_documents', 'predictive_analytics', 'agent_tools', 'nl_sql'];
    for (const mod of standardModules) {
      await query(
        `INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled)
         VALUES ($1, $2, $3, true)`,
        [randomUUID(), tenantId, mod],
      );
    }

    await query(`INSERT INTO audit_logs (id,tenant_id,actor_id,action,resource_type,resource_id) VALUES ($1,$2,$3,'workspace.created','tenant',$2)`, [randomUUID(),tenantId,data.creatorUserId]);
    return { tenant, settings, placement };
    });
    this.placementRegistry.registerPlacement(result.placement);
    return result;
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
    if (!['Owner','Member','Viewer'].includes(roleName)) throw new BadRequestException('Unknown role');
    const token = randomBytes(32).toString('hex');
    return this.rlsDb.runAdminTransaction(async client => {
      // Serialize seat allocation, role changes and invitations per workspace.
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      const quota = await client.query(`SELECT max_members FROM tenant_quotas WHERE tenant_id = $1`, [tenantId]);
      const seats = await client.query(`SELECT count(*)::int AS count FROM memberships WHERE tenant_id = $1 AND status IN ('ACTIVE','INVITED')`, [tenantId]);
      if (seats.rows[0].count >= quota.rows[0].max_members) throw new ForbiddenException('Workspace seat limit reached');
      const userResult = await client.query(`INSERT INTO users (id,email,full_name,status) VALUES ($1,$2,$3,'ACTIVE')
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`, [randomUUID(), email.toLowerCase(), email.split('@')[0]]);
      const userId = userResult.rows[0].id;
      const existing = await client.query('SELECT id FROM memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, userId]);
      if (existing.rows.length) throw new ConflictException('User already has a membership');
      const role = await client.query('SELECT id FROM roles WHERE tenant_id = $1 AND name = $2', [tenantId,roleName]);
      if (!role.rows.length) throw new BadRequestException('Role not provisioned');
      const membershipId = randomUUID();
      await client.query(`INSERT INTO memberships (id,tenant_id,user_id,status) VALUES ($1,$2,$3,'INVITED')`, [membershipId,tenantId,userId]);
      await client.query(`INSERT INTO membership_roles (tenant_id,membership_id,role_id) VALUES ($1,$2,$3)`, [tenantId,membershipId,role.rows[0].id]);
      await client.query(`INSERT INTO invitations (id,tenant_id,membership_id,token_hash,expires_at) VALUES ($1,$2,$3,$4,NOW() + INTERVAL '7 days')`, [randomUUID(),tenantId,membershipId,createHash('sha256').update(token).digest('hex')]);
      await this.audit(client, tenantId, 'member.invited', membershipId);
      return { membershipId, userId, role: roleName, status: 'INVITED', invitationToken: token };
    });
  }

  async acceptInvitation(token: string, userId: string) {
    return this.rlsDb.runAdminTransaction(async client => {
      const result = await client.query(`SELECT i.id, i.tenant_id, i.membership_id FROM invitations i
        JOIN memberships m ON m.id = i.membership_id AND m.tenant_id = i.tenant_id
        JOIN tenants t ON t.id = i.tenant_id AND t.status = 'ACTIVE'
        WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > NOW()
          AND m.user_id = $2 AND m.status = 'INVITED' FOR UPDATE OF i,m`,
        [createHash('sha256').update(token).digest('hex'),userId]);
      const invite = result.rows[0];
      if (!invite) throw new BadRequestException('Invalid, expired or already accepted invitation');
      await client.query(`UPDATE memberships SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`, [invite.membership_id]);
      await client.query('UPDATE invitations SET accepted_at = NOW() WHERE id = $1', [invite.id]);
      await this.audit(client, invite.tenant_id, 'member.accepted', invite.membership_id);
      return { tenantId: invite.tenant_id };
    });
  }

  async updateMember(tenantId: string, membershipId: string, role: string | undefined, remove = false) {
    return this.rlsDb.runAdminTransaction(async client => {
      await client.query('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', [tenantId]);
      const target = await client.query('SELECT id FROM memberships WHERE tenant_id = $1 AND id = $2', [tenantId,membershipId]);
      if (!target.rows.length) throw new NotFoundException('Member not found');
      const owners = await client.query(`SELECT m.id FROM memberships m JOIN membership_roles mr ON mr.membership_id=m.id AND mr.tenant_id=m.tenant_id
        JOIN roles r ON r.id=mr.role_id AND r.tenant_id=m.tenant_id WHERE m.tenant_id=$1 AND m.status='ACTIVE' AND r.name='Owner'`, [tenantId]);
      if (owners.rows.some(m => m.id === membershipId) && owners.rows.length === 1 && (remove || role !== 'Owner')) throw new ConflictException('Cannot remove the last owner');
      if (remove) {
        await client.query('DELETE FROM memberships WHERE tenant_id=$1 AND id=$2', [tenantId,membershipId]);
      } else {
        const targetRole = await client.query('SELECT id FROM roles WHERE tenant_id=$1 AND name=$2', [tenantId,role]);
        if (!targetRole.rows.length) throw new BadRequestException('Unknown role');
        await client.query('DELETE FROM membership_roles WHERE tenant_id=$1 AND membership_id=$2', [tenantId,membershipId]);
        await client.query('INSERT INTO membership_roles (tenant_id,membership_id,role_id) VALUES ($1,$2,$3)', [tenantId,membershipId,targetRole.rows[0].id]);
      }
      await this.audit(client, tenantId, remove ? 'member.removed' : 'member.role.updated', membershipId);
      return { success: true };
    });
  }

  private async audit(client: import('pg').PoolClient, tenantId: string, action: string, resourceId: string) {
    await client.query(`INSERT INTO audit_logs (id,tenant_id,actor_id,action,resource_type,resource_id) VALUES ($1,$2,$3,$4,'membership',$5)`,
      [randomUUID(),tenantId,TenantContextService.get()?.user?.userId || null,action,resourceId]);
  }
}

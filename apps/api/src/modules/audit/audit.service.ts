import { Injectable, Inject } from '@nestjs/common';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { AuditLog } from '@saas/types';

@Injectable()
export class AuditService {
  constructor(@Inject(RlsPostgresService) private readonly rlsDb: RlsPostgresService) {}

  /**
   * Appends an immutable audit log entry scoped to the tenant.
   */
  async recordAudit(data: {
    tenantId: string;
    actorId?: string | null;
    action: string;
    resourceType: string;
    resourceId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<AuditLog> {
    const id = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const payload = data.payload || {};

    const res = await this.rlsDb.queryInTenantContext<AuditLog>(
      data.tenantId,
      `INSERT INTO audit_logs (id, tenant_id, actor_id, action, resource_type, resource_id, ip_address, user_agent, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, tenant_id as "tenantId", actor_id as "actorId", action,
                 resource_type as "resourceType", resource_id as "resourceId",
                 ip_address as "ipAddress", user_agent as "userAgent",
                 payload, created_at as "createdAt"`,
      [
        id,
        data.tenantId,
        data.actorId || null,
        data.action,
        data.resourceType,
        data.resourceId,
        data.ipAddress || null,
        data.userAgent || null,
        JSON.stringify(payload),
      ],
    );

    return res.rows[0];
  }

  /**
   * Queries audit logs strictly isolated to the specified tenant.
   */
  async getTenantAuditLogs(tenantId: string, limit = 50): Promise<AuditLog[]> {
    const res = await this.rlsDb.queryInTenantContext<AuditLog>(
      tenantId,
      `SELECT id, tenant_id as "tenantId", actor_id as "actorId", action,
              resource_type as "resourceType", resource_id as "resourceId",
              ip_address as "ipAddress", user_agent as "userAgent",
              payload, created_at as "createdAt"
       FROM audit_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit],
    );
    return res.rows;
  }
}

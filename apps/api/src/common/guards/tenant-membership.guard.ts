import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { TenantContextService } from '../tenant-context';
import { TenantContext } from '@saas/types';

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(private readonly rlsDb: RlsPostgresService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('User must be authenticated before tenant resolution');
    }

    // Resolve tenant ID from header or route parameters
    const requestedTenantId =
      request.headers['x-tenant-id'] ||
      request.params?.tenantId ||
      request.query?.tenantId;

    if (!requestedTenantId) {
      throw new BadRequestException('A target tenant must be specified via x-tenant-id header or path');
    }

    // Accept both legacy generated tenant IDs and UUIDs. Membership is always
    // resolved server-side with parameterized SQL; an ID is never trusted alone.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const generatedIdRegex = /^ten-[0-9]+-[a-z0-9]{5}$/;
    if (typeof requestedTenantId !== 'string' ||
        (!uuidRegex.test(requestedTenantId) && !generatedIdRegex.test(requestedTenantId))) {
      throw new BadRequestException('Invalid tenant ID format');
    }

    // If platform administrator, bypass membership checks but set context
    if (user.isPlatformAdmin) {
      const tenantContext: TenantContext = {
        tenantId: requestedTenantId,
        membershipId: 'platform-admin-membership',
        roles: ['PLATFORM_ADMIN'],
        permissions: ['*'],
      };
      request.tenant = tenantContext;
      const currentStore = TenantContextService.get();
      if (currentStore) {
        currentStore.tenant = tenantContext;
      }
      return true;
    }

    // Server-side verification: Query memberships and roles using trusted server query
    const membershipResult = await this.rlsDb.queryAdmin(
      `SELECT m.id AS membership_id, m.status, r.name AS role_name, p.key AS permission_key
       FROM memberships m
       LEFT JOIN membership_roles mr ON mr.membership_id = m.id
       LEFT JOIN roles r ON r.id = mr.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE m.tenant_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'`,
      [requestedTenantId, user.userId],
    );

    if (membershipResult.rows.length === 0) {
      throw new ForbiddenException('User does not have an active membership in the requested tenant');
    }

    const membershipId = membershipResult.rows[0].membership_id;
    const roles = Array.from(
      new Set(membershipResult.rows.map((r: { role_name: string }) => r.role_name).filter(Boolean)),
    );
    const permissions = Array.from(
      new Set(membershipResult.rows.map((r: { permission_key: string }) => r.permission_key).filter(Boolean)),
    );

    const tenantContext: TenantContext = {
      tenantId: requestedTenantId,
      membershipId,
      roles: roles as string[],
      permissions: permissions as string[],
    };

    request.tenant = tenantContext;
    const currentStore = TenantContextService.get();
    if (currentStore) {
      currentStore.tenant = tenantContext;
    }

    return true;
  }
}

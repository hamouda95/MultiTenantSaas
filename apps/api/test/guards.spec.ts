import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantMembershipGuard } from '../src/common/guards/tenant-membership.guard';
import { RbacGuard } from '../src/common/guards/rbac.guard';
import { PlatformAdminGuard } from '../src/common/guards/platform-admin.guard';
import { TenantContextService } from '../src/common/tenant-context';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('Security Guards (Membership, RBAC, Platform Admin)', () => {
  let rlsDbMock: any;
  let membershipGuard: TenantMembershipGuard;
  let rbacGuard: RbacGuard;
  let platformAdminGuard: PlatformAdminGuard;
  let reflector: Reflector;

  const USER_ID = 'usr-charlie';
  const VALID_TENANT_ID = '12345678-1234-4234-a234-123456789012';
  const UNJOINED_TENANT_ID = '87654321-4321-4321-b321-210987654321';

  beforeEach(() => {
    rlsDbMock = {
      queryAdmin: vi.fn(),
    };
    membershipGuard = new TenantMembershipGuard(rlsDbMock);
    reflector = new Reflector();
    rbacGuard = new RbacGuard(reflector);
    platformAdminGuard = new PlatformAdminGuard();
  });

  describe('TenantMembershipGuard', () => {
    it('should reject requests with missing tenant ID', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: { userId: USER_ID }, headers: {} }),
        }),
      } as any;

      await expect(membershipGuard.canActivate(mockContext)).rejects.toThrow(BadRequestException);
    });

    it('should reject requests with malformed tenant ID (non-UUID)', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { userId: USER_ID },
            headers: { 'x-tenant-id': 'invalid-not-a-uuid' },
          }),
        }),
      } as any;

      await expect(membershipGuard.canActivate(mockContext)).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if user has no membership in the requested tenant', async () => {
      rlsDbMock.queryAdmin.mockResolvedValueOnce({ rows: [] });

      const mockRequest = {
        user: { userId: USER_ID, isPlatformAdmin: false },
        headers: { 'x-tenant-id': UNJOINED_TENANT_ID },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any;

      await expect(membershipGuard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });

    it('should permit access and establish TenantContext when active membership exists', async () => {
      rlsDbMock.queryAdmin.mockResolvedValueOnce({
        rows: [
          {
            membership_id: 'mem-101',
            status: 'ACTIVE',
            role_name: 'Admin',
            permission_key: 'documents:manage',
          },
          {
            membership_id: 'mem-101',
            status: 'ACTIVE',
            role_name: 'Admin',
            permission_key: 'ai:chat',
          },
        ],
      });

      const mockRequest = {
        user: { userId: USER_ID, email: 'charlie@corp.com', isPlatformAdmin: false },
        headers: { 'x-tenant-id': VALID_TENANT_ID },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as any;

      const allowed = await membershipGuard.canActivate(mockContext);
      expect(allowed).toBe(true);
      expect(mockRequest).toHaveProperty('tenant');
      expect((mockRequest as any).tenant.roles).toContain('Admin');
      expect((mockRequest as any).tenant.permissions).toContain('documents:manage');
    });
  });

  describe('RbacGuard', () => {
    it('should throw ForbiddenException when context lacks required permissions', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['billing:manage']);

      TenantContextService.run(
        {
          user: { userId: 'usr-1', email: 'test@corp.com', isPlatformAdmin: false },
          tenant: {
            tenantId: VALID_TENANT_ID,
            membershipId: 'mem-1',
            roles: ['Viewer'],
            permissions: ['documents:read'],
          },
          requestId: 'req-1',
        },
        () => {
          const mockContext = {
            getHandler: () => {},
            getClass: () => {},
          } as any;

          expect(() => rbacGuard.canActivate(mockContext)).toThrow(ForbiddenException);
        },
      );
    });

    it('should allow access when context possesses all required permissions', () => {
      vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['documents:read', 'ai:chat']);

      TenantContextService.run(
        {
          user: { userId: 'usr-1', email: 'test@corp.com', isPlatformAdmin: false },
          tenant: {
            tenantId: VALID_TENANT_ID,
            membershipId: 'mem-1',
            roles: ['Member'],
            permissions: ['documents:read', 'ai:chat', 'other:perm'],
          },
          requestId: 'req-2',
        },
        () => {
          const mockContext = {
            getHandler: () => {},
            getClass: () => {},
          } as any;

          expect(rbacGuard.canActivate(mockContext)).toBe(true);
        },
      );
    });
  });

  describe('PlatformAdminGuard', () => {
    it('should throw ForbiddenException for tenant admins attempting to access platform admin endpoints', () => {
      TenantContextService.run(
        {
          user: { userId: 'usr-tenant-admin', email: 'admin@tenant.com', isPlatformAdmin: false },
          tenant: {
            tenantId: VALID_TENANT_ID,
            membershipId: 'mem-admin',
            roles: ['Owner', 'TenantAdmin'],
            permissions: ['*'],
          },
          requestId: 'req-admin',
        },
        () => {
          expect(() => platformAdminGuard.canActivate({} as any)).toThrow(ForbiddenException);
        },
      );
    });

    it('should permit platform administrator access', () => {
      TenantContextService.run(
        {
          user: { userId: 'usr-super', email: 'ops@platform.saas', isPlatformAdmin: true },
          requestId: 'req-super',
        },
        () => {
          expect(platformAdminGuard.canActivate({} as any)).toBe(true);
        },
      );
    });
  });
});

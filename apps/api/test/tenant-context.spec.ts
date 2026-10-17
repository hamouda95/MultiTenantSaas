import { describe, it, expect } from 'vitest';
import { TenantContextService } from '../src/common/tenant-context';
import { UnauthorizedException } from '@nestjs/common';

describe('TenantContextService (AsyncLocalStorage Isolation)', () => {
  it('should throw UnauthorizedException when accessing tenantId outside context', () => {
    expect(() => TenantContextService.requireTenantId()).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when accessing userId outside context', () => {
    expect(() => TenantContextService.requireUserId()).toThrow(UnauthorizedException);
  });

  it('should correctly propagate tenant and user context within run callback', async () => {
    const mockContext = {
      user: { userId: 'usr-123', email: 'alice@corp.com', isPlatformAdmin: false },
      tenant: {
        tenantId: 'ten-corp-1',
        membershipId: 'mem-1',
        roles: ['Admin'],
        permissions: ['documents:read', 'documents:write'],
      },
      requestId: 'req-001',
    };

    await TenantContextService.run(mockContext, async () => {
      expect(TenantContextService.requireTenantId()).toBe('ten-corp-1');
      expect(TenantContextService.requireUserId()).toBe('usr-123');
      expect(TenantContextService.hasPermission('documents:read')).toBe(true);
      expect(TenantContextService.hasPermission('billing:manage')).toBe(false);
      expect(TenantContextService.isPlatformAdmin()).toBe(false);
    });
  });

  it('should maintain strict isolation between concurrent asynchronous executions', async () => {
    const tenantA = {
      user: { userId: 'usr-alice', email: 'alice@a.com', isPlatformAdmin: false },
      tenant: { tenantId: 'tenant-aaa', membershipId: 'mem-a', roles: ['Member'], permissions: ['a:read'] },
      requestId: 'req-a',
    };

    const tenantB = {
      user: { userId: 'usr-bob', email: 'bob@b.com', isPlatformAdmin: false },
      tenant: { tenantId: 'tenant-bbb', membershipId: 'mem-b', roles: ['Admin'], permissions: ['b:read'] },
      requestId: 'req-b',
    };

    const asyncTaskA = TenantContextService.run(tenantA, async () => {
      // Simulate random async I/O delay
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(TenantContextService.requireTenantId()).toBe('tenant-aaa');
      expect(TenantContextService.requireUserId()).toBe('usr-alice');
      return TenantContextService.requireTenantId();
    });

    const asyncTaskB = TenantContextService.run(tenantB, async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(TenantContextService.requireTenantId()).toBe('tenant-bbb');
      expect(TenantContextService.requireUserId()).toBe('usr-bob');
      return TenantContextService.requireTenantId();
    });

    const [resA, resB] = await Promise.all([asyncTaskA, asyncTaskB]);
    expect(resA).toBe('tenant-aaa');
    expect(resB).toBe('tenant-bbb');
  });
});

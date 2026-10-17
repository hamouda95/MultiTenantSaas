import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../src/common/auth-security';
import { IdentityService } from '../src/modules/identity/identity.service';
import { LoginDtoSchema } from '../src/common/dto/auth.dto';
import { TenantMembershipGuard } from '../src/common/guards/tenant-membership.guard';

describe('Authentication regressions', () => {
  it('requires a bounded password and salts password hashes', async () => {
    expect(LoginDtoSchema.safeParse({ email: 'a@example.com' }).success).toBe(false);
    expect(LoginDtoSchema.safeParse({ email: 'a@example.com', password: 'x'.repeat(129) }).success).toBe(false);
    const first = await hashPassword('a-long-test-password');
    const second = await hashPassword('a-long-test-password');
    expect(first).not.toBe(second);
    expect(await verifyPassword('a-long-test-password', first)).toBe(true);
    expect(await verifyPassword('wrong-password', first)).toBe(false);
    expect(await verifyPassword('a-long-test-password', null)).toBe(false);
  });
  it('does not provision unknown accounts through login', async () => {
    const db = { queryAdmin: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new IdentityService(db as any, {} as any);
    await expect(service.authenticate('missing@example.com', 'a-long-test-password')).rejects.toThrow('Invalid email or password');
    expect(db.queryAdmin).toHaveBeenCalledTimes(1);
    expect(db.queryAdmin.mock.calls[0][0]).toMatch(/^SELECT/);
  });
  it('rejects tenant path/header mismatches before accessing the database', async () => {
    const db = { queryAdmin: vi.fn() };
    const guard = new TenantMembershipGuard(db as any);
    const request = { user: { userId: 'user' }, headers: { 'x-tenant-id': '11111111-1111-4111-a111-111111111111' }, params: { tenantId: '22222222-2222-4222-a222-222222222222' } };
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as any)).rejects.toThrow('Tenant header and route must match');
    expect(db.queryAdmin).not.toHaveBeenCalled();
  });
});

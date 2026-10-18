import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { IdentityController } from '../src/modules/identity/identity.controller';
import { LoginDtoSchema } from '../src/common/dto/auth.dto';

describe('P0 login regression', () => {
  it('requires a password', () => {
    expect(LoginDtoSchema.safeParse({ email: 'person@example.com' }).success).toBe(false);
  });

  it('does not create a user when the email is unknown', async () => {
    const service = {
      findByEmail: vi.fn().mockResolvedValue(null),
      verifyPassword: vi.fn(),
      createUser: vi.fn(),
      generateToken: vi.fn(),
    };
    const controller = new IdentityController(service as any);
    await expect(controller.login({ email: 'unknown@example.com', password: 'invalid-password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.createUser).not.toHaveBeenCalled();
    expect(service.generateToken).not.toHaveBeenCalled();
  });

  it('rejects invalid credentials without issuing a JWT', async () => {
    const service = {
      findByEmail: vi.fn().mockResolvedValue({ id: 'id', email: 'person@example.com' }),
      verifyPassword: vi.fn().mockResolvedValue(false),
      generateToken: vi.fn(),
    };
    const controller = new IdentityController(service as any);
    await expect(controller.login({ email: 'person@example.com', password: 'wrong-password' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.generateToken).not.toHaveBeenCalled();
  });
});

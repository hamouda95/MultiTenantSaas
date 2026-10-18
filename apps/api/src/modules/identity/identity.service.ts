import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { User, AuthenticatedUserContext } from '@saas/types';

@Injectable()
function requiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return secret;
}

export class IdentityService {
  constructor(
    @Inject(RlsPostgresService) private readonly rlsDb: RlsPostgresService,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  /**
   * Issue a signed JWT token containing standard claims.
   */
  async generateToken(user: { id: string; email: string; isPlatformAdmin: boolean }): Promise<string> {
    const payload = {
      sub: user.id,
      userId: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    return this.jwtService.signAsync(payload, {
      secret: requiredJwtSecret(),
      expiresIn: '24h',
    });
  }

  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const result = await this.rlsDb.queryAdmin<{ password_hash: string | null; status: string }>(
      'SELECT password_hash, status FROM users WHERE id = $1', [userId],
    );
    const record = result.rows[0];
    if (!record || record.status !== 'ACTIVE' || !record.password_hash) return false;
    const [algorithm, salt, encoded] = record.password_hash.split(':');
    if (algorithm !== 'scrypt' || !salt || !encoded) return false;
    const expected = Buffer.from(encoded, 'hex');
    if (expected.length !== 64) return false;
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    return timingSafeEqual(actual, expected);
  }

  /**
   * Find a user by email.
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.rlsDb.queryAdmin<User>(
      'SELECT id, email, full_name as "fullName", avatar_url as "avatarUrl", is_platform_admin as "isPlatformAdmin", status, created_at as "createdAt", updated_at as "updatedAt" FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    return result.rows[0] || null;
  }

  /**
   * Retrieve all tenant memberships for a user (used for workspace switching).
   */
  async getUserWorkspaces(userId: string) {
    const result = await this.rlsDb.queryAdmin(
      `SELECT t.id as "tenantId", t.slug, t.name, t.status as "tenantStatus",
              m.id as "membershipId", m.status as "membershipStatus",
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') as roles
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       LEFT JOIN membership_roles mr ON mr.membership_id = m.id
       LEFT JOIN roles r ON r.id = mr.role_id
       WHERE m.user_id = $1 AND m.status = 'ACTIVE'
       GROUP BY t.id, t.slug, t.name, t.status, m.id, m.status`,
      [userId],
    );

    return result.rows;
  }

  /**
   * Seed/Create user helper for testing and initial tenant provisioning.
   */
  async createUser(data: {
    id?: string;
    email: string;
    fullName: string;
    isPlatformAdmin?: boolean;
  }): Promise<User> {
    const userId = data.id || randomUUID();
    const result = await this.rlsDb.queryAdmin<User>(
      `INSERT INTO users (id, email, full_name, is_platform_admin, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id, email, full_name as "fullName", is_platform_admin as "isPlatformAdmin", status, created_at as "createdAt", updated_at as "updatedAt"`,
      [userId, data.email.toLowerCase(), data.fullName, Boolean(data.isPlatformAdmin)],
    );
    return result.rows[0];
  }
}

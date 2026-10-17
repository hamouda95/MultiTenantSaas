import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { User, AuthenticatedUserContext } from '@saas/types';

@Injectable()
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
      secret: process.env.JWT_SECRET || 'dev_secret_key_change_in_production_32chars',
      expiresIn: '24h',
    });
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
    const userId = data.id || `usr-${Date.now()}`;
    const result = await this.rlsDb.queryAdmin<User>(
      `INSERT INTO users (id, email, full_name, is_platform_admin, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING id, email, full_name as "fullName", is_platform_admin as "isPlatformAdmin", status, created_at as "createdAt", updated_at as "updatedAt"`,
      [userId, data.email.toLowerCase(), data.fullName, Boolean(data.isPlatformAdmin)],
    );
    return result.rows[0];
  }
}

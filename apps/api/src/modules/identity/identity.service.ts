import { hashPassword, verifyPassword, jwtSecret } from '../../common/auth-security';
import { randomUUID, createHash } from 'node:crypto';
import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import { User, AuthenticatedUserContext } from '@saas/types';

@Injectable()
export class IdentityService {
  constructor(
    @Inject(RlsPostgresService) private readonly rlsDb: RlsPostgresService,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  async authenticate(email: string, password: string): Promise<User> {
    const result = await this.rlsDb.queryAdmin('SELECT password_hash, status FROM users WHERE email = $1', [email.toLowerCase()]);
    const valid = await verifyPassword(password, result.rows[0]?.password_hash);
    if (!valid || result.rows[0]?.status !== 'ACTIVE') throw new UnauthorizedException('Invalid email or password');
    return (await this.findByEmail(email))!;
  }

  async register(email: string, password: string, fullName: string, invitationToken?: string) {
    const passwordHash = await hashPassword(password);
    try {
      if (invitationToken) {
        const result = await this.rlsDb.queryAdmin<User>(
          `UPDATE users SET password_hash=$1, full_name=$2 WHERE email=$3 AND password_hash IS NULL
           AND EXISTS (SELECT 1 FROM memberships m JOIN invitations i ON i.membership_id=m.id
             WHERE m.user_id=users.id AND i.token_hash=$4 AND i.expires_at > NOW() AND i.accepted_at IS NULL)
           RETURNING id,email,full_name as "fullName",is_platform_admin as "isPlatformAdmin",status`,
          [passwordHash,fullName,email.toLowerCase(),createHash('sha256').update(invitationToken).digest('hex')]);
        if (!result.rows[0]) throw new ConflictException('Invalid invitation or account already registered');
        return result.rows[0];
      }
      const result = await this.rlsDb.queryAdmin<User>(
        `INSERT INTO users (id, email, full_name, password_hash, status) VALUES ($1,$2,$3,$4,'ACTIVE')
         RETURNING id, email, full_name as "fullName", is_platform_admin as "isPlatformAdmin", status`,
        [randomUUID(), email.toLowerCase(), fullName, passwordHash]);
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Account already exists');
      throw error;
    }
  }

  async revokeSession(cookie: string | undefined) {
    const token = cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('saas_session='))?.slice(13);
    if (!token) return;
    let payload: { jti: string };
    try { payload = await this.jwtService.verifyAsync(token, { secret: jwtSecret(), algorithms: ['HS256'] }); }
    catch { return; }
    await this.rlsDb.queryAdmin('DELETE FROM auth_sessions WHERE id = $1', [payload.jti]);
  }

  /**
   * Issue a signed JWT token containing standard claims.
   */
  async generateToken(user: { id: string; email: string; isPlatformAdmin: boolean }): Promise<string> {
    const sessionId = randomUUID();
    await this.rlsDb.queryAdmin(`INSERT INTO auth_sessions (id,user_id,expires_at) VALUES ($1,$2,NOW() + INTERVAL '8 hours')`, [sessionId,user.id]);
    const payload = {
      jti: sessionId,
      sub: user.id,
      userId: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
    };

    return this.jwtService.signAsync(payload, {
      secret: jwtSecret(),
      expiresIn: '8h',
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
       WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND t.status = 'ACTIVE'
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

import { jwtSecret, sessionCookie } from '../auth-security';
import { RlsPostgresService } from '../../database/rls-postgres.service';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedUserContext } from '@saas/types';
import { TenantContextService } from '../tenant-context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService, private readonly db: RlsPostgresService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    const cookie = request.headers.cookie?.split(';').map((v: string) => v.trim()).find((v: string) => v.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : cookie;
    if (!token) throw new UnauthorizedException('Authentication required');

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: jwtSecret(),
        algorithms: ['HS256'],
      });

      if (!payload.sub || !payload.email) throw new Error('Invalid claims');
      const account = await this.db.queryAdmin(`SELECT u.status, u.is_platform_admin FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.expires_at > NOW()`, [payload.sub,payload.jti]);
      if (account.rows[0]?.status !== 'ACTIVE') throw new Error('Inactive account');
      const userContext: AuthenticatedUserContext = {
        userId: payload.sub || payload.userId,
        email: payload.email,
        isPlatformAdmin: Boolean(account.rows[0].is_platform_admin),
      };

      request.user = userContext;

      // Ensure AsyncLocalStorage has user context initialized
      const currentStore = TenantContextService.get();
      if (currentStore) {
        currentStore.user = userContext;
      }

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }
}

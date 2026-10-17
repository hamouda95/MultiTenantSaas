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
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev_secret_key_change_in_production_32chars',
      });

      const userContext: AuthenticatedUserContext = {
        userId: payload.sub || payload.userId,
        email: payload.email,
        isPlatformAdmin: Boolean(payload.isPlatformAdmin),
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

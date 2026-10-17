import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { TenantContextService } from '../tenant-context';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const store = TenantContextService.get();

    if (!store?.user?.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator privileges required for this endpoint');
    }

    return true;
  }
}

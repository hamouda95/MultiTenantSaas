import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUserContext } from '@saas/types';
import { TenantContextService } from '../tenant-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): AuthenticatedUserContext => {
    const store = TenantContextService.get();
    if (!store?.user) {
      throw new Error('CurrentUser decorator invoked outside authenticated request context');
    }
    return store.user;
  },
);

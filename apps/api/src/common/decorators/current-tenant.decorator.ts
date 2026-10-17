import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@saas/types';
import { TenantContextService } from '../tenant-context';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): TenantContext => {
    const store = TenantContextService.get();
    if (!store?.tenant) {
      throw new Error('CurrentTenant decorator invoked outside active tenant context');
    }
    return store.tenant;
  },
);

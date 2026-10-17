import { AsyncLocalStorage } from 'async_hooks';
import { UnauthorizedException } from '@nestjs/common';
import { TenantContext, AuthenticatedUserContext } from '@saas/types';

export interface RequestExecutionContext {
  user: AuthenticatedUserContext;
  tenant?: TenantContext;
  requestId: string;
}

const tenantStorage = new AsyncLocalStorage<RequestExecutionContext>();

export class TenantContextService {
  /**
   * Run an asynchronous function within the specified security execution context.
   */
  static run<R>(context: RequestExecutionContext, callback: () => Promise<R> | R): Promise<R> | R {
    return tenantStorage.run(context, callback);
  }

  /**
   * Get the current execution context or undefined if outside a scoped context.
   */
  static get(): RequestExecutionContext | undefined {
    return tenantStorage.getStore();
  }

  /**
   * Retrieve the active verified tenant ID or throw an UnauthorizedException.
   */
  static requireTenantId(): string {
    const store = tenantStorage.getStore();
    if (!store?.tenant?.tenantId) {
      throw new UnauthorizedException('Tenant context has not been established for this operation');
    }
    return store.tenant.tenantId;
  }

  /**
   * Retrieve the active verified user ID or throw an UnauthorizedException.
   */
  static requireUserId(): string {
    const store = tenantStorage.getStore();
    if (!store?.user?.userId) {
      throw new UnauthorizedException('User context has not been established for this operation');
    }
    return store.user.userId;
  }

  /**
   * Check if current user has platform administrator privileges.
   */
  static isPlatformAdmin(): boolean {
    const store = tenantStorage.getStore();
    return Boolean(store?.user?.isPlatformAdmin);
  }

  /**
   * Check if current context holds a specific tenant permission.
   */
  static hasPermission(permissionKey: string): boolean {
    const store = tenantStorage.getStore();
    if (store?.user?.isPlatformAdmin) return true;
    return Boolean(store?.tenant?.permissions?.includes(permissionKey));
  }
}

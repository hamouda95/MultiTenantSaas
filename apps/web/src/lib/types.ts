import type {
  AuditLog,
  Tenant,
  TenantDataPlacement,
  TenantModule,
  TenantQuota,
  TenantSettings,
  ThemeMode,
} from '@saas/types';

/** Les contrats partagés utilisent `Date`; sur le réseau (JSON) ce sont des chaînes ISO. */
export type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type ApiTenant = Serialized<Tenant>;
export type ApiSettings = Serialized<TenantSettings>;
export type ApiModule = Serialized<TenantModule>;
export type ApiQuota = Serialized<TenantQuota>;
export type ApiAuditLog = Serialized<AuditLog>;
export type ApiPlacement = Serialized<TenantDataPlacement>;
export type { ThemeMode };

export interface ApiUser {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
}

export interface Workspace {
  tenantId: string;
  slug: string;
  name: string;
  tenantStatus: string;
  membershipId: string;
  membershipStatus: string;
  roles: string[];
}

export interface Member {
  id: string;
  status: string;
  createdAt: string;
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
}

export interface LoginResponse {

  user: ApiUser;
  workspaces: Workspace[];
}

export interface SettingsResponse {
  settings: ApiSettings;
  cssVariables: Record<string, string>;
}

export interface CreateTenantResponse {
  tenant: ApiTenant;
  settings: ApiSettings;
  placement: ApiPlacement;
}

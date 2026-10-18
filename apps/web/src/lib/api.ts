import type {
  ApiAuditLog,
  ApiModule,
  ApiQuota,
  ApiSettings,
  ApiTenant,
  CreateTenantResponse,
  LoginResponse,
  Member,
  SettingsResponse,
  Workspace,
} from "./types";

// Browser requests use the same-origin Next.js proxy; the session cookie is HttpOnly.
export const API_URL = "";

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isForbidden() {
    return this.status === 403;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  tenantId?: string;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, tenantId, auth = true } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (tenantId) headers["x-tenant-id"] = tenantId;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      `Impossible de joindre l'API (${API_URL}). Vérifiez qu'elle est démarrée.`,
    );
  }

  if (!res.ok) {
    let message = res.statusText || "Erreur inconnue";
    let details: string[] = [];
    try {
      const data = await res.json();
      if (Array.isArray(data?.message)) message = data.message.join(", ");
      else if (typeof data?.message === "string") message = data.message;
      if (Array.isArray(data?.details)) details = data.details.map(String);
    } catch {
      /* corps non JSON */
    }
    if (res.status === 401 && auth) onUnauthorized?.();
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const t = (id: string) => `/api/v1/tenants/${encodeURIComponent(id)}`;

export const api = {
  hrCompanies: (id: string) =>
    request<Array<{ id: string; name: string; currency: string }>>(
      `${t(id)}/hr/companies`,
      { tenantId: id },
    ),
  administration: () =>
    request<{
      platformAdmin: boolean;
      holdings: {
        id: string;
        name: string;
        slug: string;
        status: string;
        mode: string;
        version: number;
        reason: string;
      }[];
    }>("/api/v1/administration/holdings"),
  holdingLifecycle: (id: string, body: unknown) =>
    request(`/api/v1/administration/holdings/${id}/lifecycle`, {
      method: "POST",
      body,
    }),
  exportHolding: (id: string) =>
    request<Record<string, unknown>>(
      `/api/v1/administration/holdings/${id}/export`,
      { method: "POST", body: {} },
    ),
  pos: (id: string) =>
    request<import("@saas/types").PosSnapshot>(`${t(id)}/business/pos`, {
      tenantId: id,
    }),
  posCommand: (
    id: string,
    version: number,
    action: unknown,
    commandId: string,
  ) =>
    request<import("@saas/types").PosSnapshot>(
      `${t(id)}/business/pos/commands`,
      { method: "POST", tenantId: id, body: { version, action, commandId } },
    ),
  hrEmployees: (id: string, companyId: string) =>
    request<
      Array<{
        id: string;
        userId: string | null;
        displayName: string;
        startDate: string;
        endDate: string | null;
      }>
    >(`${t(id)}/hr/companies/${encodeURIComponent(companyId)}/employees`, {
      tenantId: id,
    }),
  hrContracts: (id: string, companyId: string) =>
    request<
      Array<{
        id: string;
        employeeId: string;
        startDate: string;
        endDate: string | null;
        monthlyGrossMinor: string;
        currency: string;
      }>
    >(`${t(id)}/hr/companies/${encodeURIComponent(companyId)}/contracts`, {
      tenantId: id,
    }),
  hrLeaves: (id: string, companyId: string) =>
    request<
      Array<{
        id: string;
        employeeId: string;
        startsOn: string;
        endsOn: string;
        status: string;
      }>
    >(`${t(id)}/hr/companies/${encodeURIComponent(companyId)}/leave`, {
      tenantId: id,
    }),
  hrCreateEmployee: (
    id: string,
    companyId: string,
    body: { displayName: string; startDate: string; userId?: string },
  ) =>
    request<{ id: string }>(
      `${t(id)}/hr/companies/${encodeURIComponent(companyId)}/employees`,
      { method: "POST", tenantId: id, body },
    ),
  hrCreateContract: (
    id: string,
    companyId: string,
    body: {
      employeeId: string;
      startDate: string;
      monthlyGrossMinor: number;
      currency: string;
    },
  ) =>
    request<{ id: string }>(
      `${t(id)}/hr/companies/${encodeURIComponent(companyId)}/contracts`,
      { method: "POST", tenantId: id, body },
    ),
  hrRequestLeave: (
    id: string,
    companyId: string,
    body: { employeeId: string; startsOn: string; endsOn: string },
  ) =>
    request<{ id: string; status: string }>(
      `${t(id)}/hr/companies/${encodeURIComponent(companyId)}/leave`,
      { method: "POST", tenantId: id, body },
    ),
  hrDecideLeave: (
    id: string,
    companyId: string,
    leaveId: string,
    status: "APPROVED" | "REJECTED",
  ) =>
    request<{ id: string; status: string }>(
      `${t(id)}/hr/companies/${encodeURIComponent(companyId)}/leave/${encodeURIComponent(leaveId)}`,
      { method: "PATCH", tenantId: id, body: { status } },
    ),
  business: (id: string) =>
    request<import("@saas/types").BusinessSnapshot>(`${t(id)}/business`, {
      tenantId: id,
    }),
  businessCommand: (
    id: string,
    version: number,
    action: unknown,
    commandId: string,
  ) =>
    request<import("@saas/types").BusinessSnapshot>(
      `${t(id)}/business/commands`,
      { method: "POST", tenantId: id, body: { version, action, commandId } },
    ),
  me: () =>
    request<{ profile: import("./types").ApiUser }>("/api/v1/auth/me", {
      auth: false,
    }),
  logout: () => request("/api/v1/auth/logout", { method: "POST", body: {} }),
  register: (
    email: string,
    password: string,
    fullName: string,
    invitationToken?: string,
  ) =>
    request<LoginResponse>("/api/v1/auth/register", {
      method: "POST",
      auth: false,
      body: { email, password, fullName, invitationToken },
    }),
  acceptInvitation: (token: string) =>
    request<{ tenantId: string }>("/api/v1/tenants/invitations/accept", {
      method: "POST",
      body: { token },
    }),
  updateMember: (id: string, membershipId: string, role: string) =>
    request(`${t(id)}/members/${membershipId}`, {
      method: "PATCH",
      tenantId: id,
      body: { role },
    }),
  removeMember: (id: string, membershipId: string) =>
    request(`${t(id)}/members/${membershipId}`, {
      method: "DELETE",
      tenantId: id,
    }),
  login: (email: string, password?: string) =>
    request<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      auth: false,
      body: { email, ...(password ? { password } : {}) },
    }),

  workspaces: () =>
    request<{ workspaces: Workspace[] }>("/api/v1/auth/workspaces").then(
      (r) => r.workspaces,
    ),

  createTenant: (body: {
    name: string;
    slug: string;
    placementMode: "SHARED" | "DEDICATED";
    primaryColor?: string;
  }) =>
    request<CreateTenantResponse>("/api/v1/tenants", { method: "POST", body }),

  tenant: (id: string) => request<ApiTenant>(t(id), { tenantId: id }),

  members: (id: string) =>
    request<Member[]>(`${t(id)}/members`, { tenantId: id }),

  addMember: (id: string, body: { email: string; role: string }) =>
    request<{
      membershipId: string;
      userId: string;
      role: string;
      invitationToken: string;
    }>(`${t(id)}/members`, {
      method: "POST",
      tenantId: id,
      body,
    }),

  settings: (id: string) =>
    request<SettingsResponse>(`${t(id)}/settings`, { tenantId: id }),

  updateSettings: (
    id: string,
    body: Partial<{
      logoUrl: string | null;
      primaryColor: string;
      accentColor: string;
      themeMode: "LIGHT" | "DARK" | "SYSTEM";
      customDomain: string | null;
    }>,
  ) =>
    request<ApiSettings>(`${t(id)}/settings`, {
      method: "PATCH",
      tenantId: id,
      body,
    }),

  modules: (id: string) =>
    request<ApiModule[]>(`${t(id)}/modules`, { tenantId: id }),

  toggleModule: (
    id: string,
    moduleKey: string,
    isEnabled: boolean,
    configuration: Record<string, unknown> = {},
  ) =>
    request<ApiModule>(`${t(id)}/modules/${encodeURIComponent(moduleKey)}`, {
      method: "PATCH",
      tenantId: id,
      body: { isEnabled, configuration },
    }),

  quotas: (id: string) =>
    request<ApiQuota>(`${t(id)}/quotas`, { tenantId: id }),

  auditLogs: (id: string, limit = 50) =>
    request<ApiAuditLog[]>(`${t(id)}/audit-logs?limit=${limit}`, {
      tenantId: id,
    }),
};

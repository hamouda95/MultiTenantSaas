// ==============================================================================
// Shared Domain Contracts & Types for Enterprise Multi-Tenant SaaS
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. Identity & Multi-Tenancy
// ------------------------------------------------------------------------------

export type TenantStatus = "ACTIVE" | "SUSPENDED" | "DECOMMISSIONED";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  isPlatformAdmin: boolean;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED";

export interface Membership {
  id: string;
  tenantId: string;
  userId: string;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
  tenant?: Tenant;
  roles?: Role[];
}

export interface Permission {
  id: string;
  key: string;
  description: string;
  createdAt: Date;
}

export interface Role {
  id: string;
  tenantId?: string | null; // null if platform system default role
  name: string;
  description?: string | null;
  isSystemRole: boolean;
  permissions?: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------------------------------------
// 2. Tenant Settings & Branding
// ------------------------------------------------------------------------------

export type ThemeMode = "LIGHT" | "DARK" | "SYSTEM";

export interface TenantSettings {
  id: string;
  tenantId: string;
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  themeMode: ThemeMode;
  customDomain?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------------------------------------
// 3. Modules & Entitlements
// ------------------------------------------------------------------------------

export type StandardModuleKey =
  | "ai_chat"
  | "rag_documents"
  | "predictive_analytics"
  | "agent_tools"
  | "nl_sql"
  | "audit_exports"
  | "custom_branding";

export interface TenantModule {
  id: string;
  tenantId: string;
  moduleKey: string;
  isEnabled: boolean;
  configuration: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------------------------------------
// 4. Quotas & Budgets
// ------------------------------------------------------------------------------

export interface TenantQuota {
  id: string;
  tenantId: string;
  monthlyAiTokenBudget: number;
  monthlyAiCostBudget: number;
  maxMembers: number;
  maxStorageBytes: number;
  currentAiTokensUsed: number;
  currentAiCostUsed: number;
  resetCycleDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------------------------------------
// 5. Data Placement (Hybrid Database Architecture)
// ------------------------------------------------------------------------------

export type DataPlacementMode = "SHARED" | "DEDICATED";

export interface TenantDataPlacement {
  id: string;
  tenantId: string;
  placementMode: DataPlacementMode;
  connectionUrlSecretName?: string | null;
  schemaName: string;
  region: string;
  createdAt: Date;
  updatedAt: Date;
}

// ------------------------------------------------------------------------------
// 6. Audit Logging & Outbox Events
// ------------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  tenantId: string;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface BusinessEvent<T = Record<string, unknown>> {
  id: string;
  tenantId: string;
  eventType: string;
  eventVersion: string;
  payload: T;
  occurredAt: Date;
  publishedAt?: Date | null;
  retryCount: number;
  errorMessage?: string | null;
}

// ------------------------------------------------------------------------------
// 7. Documents & Vector Storage (RAG)
// ------------------------------------------------------------------------------

export type DocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export interface Document {
  id: string;
  tenantId: string;
  uploadedBy?: string | null;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  status: DocumentStatus;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentChunk {
  id: string;
  tenantId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// ------------------------------------------------------------------------------
// 8. AI Capabilities & Execution
// ------------------------------------------------------------------------------

export type AICapability = "CHAT" | "RAG" | "PREDICTION" | "AGENT" | "NL_SQL";
export type AIRunStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type ToolApprovalStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export interface Conversation {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface AIRun {
  id: string;
  tenantId: string;
  userId: string;
  capability: AICapability;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  status: AIRunStatus;
  errorMessage?: string | null;
  durationMs: number;
  createdAt: Date;
}

export interface AIToolCall {
  id: string;
  tenantId: string;
  aiRunId: string;
  toolName: string;
  inputPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown> | null;
  requiresApproval: boolean;
  approvalStatus: ToolApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  status: string;
  createdAt: Date;
}

export interface MLPrediction {
  id: string;
  tenantId: string;
  modelName: string;
  modelVersion: string;
  inputFeatures: Record<string, unknown>;
  predictionOutput: Record<string, unknown>;
  anomalyScore?: number | null;
  isAnomaly: boolean;
  createdAt: Date;
}

export interface AIUsageRecord {
  id: string;
  tenantId: string;
  periodDate: string; // YYYY-MM-DD
  totalTokens: number;
  totalCost: number;
  callCount: number;
  createdAt: Date;
}

// ------------------------------------------------------------------------------
// 9. API & Request Context
// ------------------------------------------------------------------------------

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
}

export interface TenantContext {
  tenantId: string;
  membershipId: string;
  roles: string[];
  permissions: string[];
}

export interface RequestSecurityContext {
  user: AuthenticatedUserContext;
  tenant?: TenantContext;
}

export * from "./business";
export * from "./business-insights";

export * from "./business-period";

export * from "./business-monthly";

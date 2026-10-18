-- ==============================================================================
-- 01_schema_and_rls.sql
-- Complete Multi-Tenant Schema with PostgreSQL Row-Level Security (RLS)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Helper function for resolving the transaction-local tenant context
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

-- ------------------------------------------------------------------------------
-- 2. Core Identity & Multi-Tenancy Tables
-- ------------------------------------------------------------------------------

-- Tenants (Global entity)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, DECOMMISSIONED
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Users (Global entity, accounts can belong to multiple tenants)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, SUSPENDED
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_platform_admin ON users(is_platform_admin);

-- Memberships (Bridge: User <-> Tenant)
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- INVITED, ACTIVE, SUSPENDED, REVOKED
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_membership_tenant_user UNIQUE(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_id ON memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);

-- Permissions (Platform-wide or Tenant-custom permissions)
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(64) UNIQUE NOT NULL, -- e.g. 'documents:read', 'ai:chat', 'members:manage'
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed standard system permissions
INSERT INTO permissions (key, description) VALUES
  ('members:read', 'View organization members and roles'),
  ('members:manage', 'Invite, add, and remove organization members'),
  ('settings:read', 'View organization settings and branding'),
  ('settings:manage', 'Update organization branding, colors, and domains'),
  ('modules:manage', 'Enable or disable organization feature modules'),
  ('quotas:read', 'View organization usage limits and AI quotas'),
  ('audit:read', 'View organization security audit trail'),
  ('documents:read', 'View and search knowledge base documents'),
  ('documents:write', 'Upload and index knowledge base documents'),
  ('documents:delete', 'Delete knowledge base documents'),
  ('ai:chat', 'Use conversational AI assistants'),
  ('ai:rag', 'Perform semantic document retrieval'),
  ('ai:analytics', 'Execute predictive analytics and NL-to-SQL')
ON CONFLICT (key) DO NOTHING;

-- Roles (Tenant-scoped custom roles or default system roles)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for global/system defaults
  name VARCHAR(64) NOT NULL,
  description VARCHAR(255),
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_role_tenant_name UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);

-- RolePermissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- MembershipRoles (Tenant-scoped role assignments)
CREATE TABLE IF NOT EXISTS membership_roles (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (membership_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_membership_roles_tenant_id ON membership_roles(tenant_id);

-- ------------------------------------------------------------------------------
-- 3. Tenant Configuration, Placement & Entitlements
-- ------------------------------------------------------------------------------

-- Tenant Settings & Branding
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color VARCHAR(16) NOT NULL DEFAULT '#0F172A',
  accent_color VARCHAR(16) NOT NULL DEFAULT '#2563EB',
  theme_mode VARCHAR(16) NOT NULL DEFAULT 'SYSTEM', -- LIGHT, DARK, SYSTEM
  custom_domain VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id);

-- Tenant Modules & Entitlements
CREATE TABLE IF NOT EXISTS tenant_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key VARCHAR(64) NOT NULL, -- e.g. 'ai_chat', 'rag_documents', 'predictive_analytics', 'agent_tools', 'nl_sql'
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_module UNIQUE(tenant_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant ON tenant_modules(tenant_id);

-- Tenant Quotas & Budgets
CREATE TABLE IF NOT EXISTS tenant_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  monthly_ai_token_budget BIGINT NOT NULL DEFAULT 1000000,
  monthly_ai_cost_budget NUMERIC(10, 4) NOT NULL DEFAULT 50.00,
  max_members INT NOT NULL DEFAULT 50,
  max_storage_bytes BIGINT NOT NULL DEFAULT 10737418240, -- 10 GB
  current_ai_tokens_used BIGINT NOT NULL DEFAULT 0,
  current_ai_cost_used NUMERIC(10, 4) NOT NULL DEFAULT 0.00,
  reset_cycle_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_quotas_tenant ON tenant_quotas(tenant_id);

-- Tenant Data Placement (Hybrid Database Architecture)
CREATE TABLE IF NOT EXISTS tenant_data_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  placement_mode VARCHAR(32) NOT NULL DEFAULT 'SHARED', -- 'SHARED' or 'DEDICATED'
  connection_url_secret_name VARCHAR(255), -- Reference to vault / secret manager, never raw password
  schema_name VARCHAR(64) DEFAULT 'public',
  region VARCHAR(32) NOT NULL DEFAULT 'eu-central-1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_placement_tenant ON tenant_data_placements(tenant_id);

-- ------------------------------------------------------------------------------
-- 4. Audit Logging & Transactional Outbox
-- ------------------------------------------------------------------------------

-- Audit Logs (Tenant-scoped immutable ledger)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL, -- e.g. 'membership.create', 'role.update', 'document.delete'
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Business Events (Transactional Outbox for ClickHouse Analytics)
CREATE TABLE IF NOT EXISTS business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  event_version VARCHAR(16) NOT NULL DEFAULT '1.0',
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_business_events_unpublished ON business_events(published_at, occurred_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_business_events_tenant ON business_events(tenant_id);

-- ------------------------------------------------------------------------------
-- 5. Knowledge Documents & Vector Storage (RAG)
-- ------------------------------------------------------------------------------

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  s3_key TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, READY, FAILED
  chunk_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- Document Chunks with pgvector
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT NOT NULL,
  embedding vector(1536), -- 1536 dimensions for standard embedding models
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant ON document_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id);

-- ------------------------------------------------------------------------------
-- 6. AI Gateway, Conversations & Runs
-- ------------------------------------------------------------------------------

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL, -- 'user', 'assistant', 'system', 'tool'
  content TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

-- AI Runs
CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability VARCHAR(32) NOT NULL, -- 'CHAT', 'RAG', 'PREDICTION', 'AGENT', 'NL_SQL'
  model_id VARCHAR(64) NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  cost NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
  status VARCHAR(32) NOT NULL DEFAULT 'RUNNING', -- 'RUNNING', 'COMPLETED', 'FAILED'
  error_message TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_tenant ON ai_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_user ON ai_runs(user_id);

-- AI Tool Calls & Human Approvals
CREATE TABLE IF NOT EXISTS ai_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ai_run_id UUID NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  tool_name VARCHAR(64) NOT NULL,
  input_payload JSONB NOT NULL,
  output_payload JSONB,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approval_status VARCHAR(32) NOT NULL DEFAULT 'NONE', -- 'NONE', 'PENDING', 'APPROVED', 'REJECTED'
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_tenant ON ai_tool_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_run ON ai_tool_calls(ai_run_id);

-- ML Predictions
CREATE TABLE IF NOT EXISTS ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  model_name VARCHAR(64) NOT NULL,
  model_version VARCHAR(32) NOT NULL,
  input_features JSONB NOT NULL,
  prediction_output JSONB NOT NULL,
  anomaly_score NUMERIC(6, 4),
  is_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_tenant ON ml_predictions(tenant_id);

-- AI Usage Records (Daily/Hourly Aggregation)
CREATE TABLE IF NOT EXISTS ai_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  total_cost NUMERIC(10, 4) NOT NULL DEFAULT 0.00,
  call_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ai_usage_tenant_date UNIQUE(tenant_id, period_date)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant ON ai_usage_records(tenant_id);

-- ------------------------------------------------------------------------------
-- 7. Grant Privileges to Restricted Application Role (saas_runtime)
-- ------------------------------------------------------------------------------
-- Permissions applicatives sur les tables tenant uniquement.
-- Les tables globales et sensibles sont traitées séparément.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  memberships, roles, membership_roles,
  tenant_settings, tenant_modules, tenant_quotas,
  tenant_data_placements, business_events,
  documents, document_chunks, conversations, messages,
  ai_runs, ai_tool_calls, ml_predictions, ai_usage_records
TO saas_runtime;

GRANT SELECT, INSERT ON audit_logs TO saas_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO saas_runtime;

-- ------------------------------------------------------------------------------
-- 8. PostgreSQL Row-Level Security (RLS) Configuration
-- ------------------------------------------------------------------------------

-- Function to apply uniform tenant isolation policy
DO $$
DECLARE
  tbl_name text;
  tenant_tables text[] := ARRAY[
    'memberships',
    'roles',
    'membership_roles',
    'tenant_settings',
    'tenant_modules',
    'tenant_quotas',
    'tenant_data_placements',
    'audit_logs',
    'business_events',
    'documents',
    'document_chunks',
    'conversations',
    'messages',
    'ai_runs',
    'ai_tool_calls',
    'ml_predictions',
    'ai_usage_records'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY tenant_tables
  LOOP
    -- Enable and FORCE Row Level Security (applies even to table owners if not superuser)
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl_name);

    -- Drop existing policy if any
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl_name);

    -- Create strict isolation policy based on current_tenant_id()
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I ' ||
      'FOR ALL ' ||
      'TO saas_runtime ' ||
      'USING (tenant_id = current_tenant_id()) ' ||
      'WITH CHECK (tenant_id = current_tenant_id());',
      tbl_name
    );
  END LOOP;
END
$$;

# Multi-Tenant Application Security & Threat Model

## 1. Security Principles

1. **Isolation as a Security Boundary**: Tenant isolation is enforced at the database and storage level, never delegated to frontend filtering.
2. **Zero Trust on Client Tenant IDs**: Client-provided tenant IDs (in URLs, headers, or payloads) are treated as untrusted hints. Authorization is established solely via server-side session tokens cross-referenced against the tenant membership table.
3. **Defense-in-Depth**:
   - Layer 1: Reverse proxy & rate limiting.
   - Layer 2: Authentication & session validation (OIDC/JWT).
   - Layer 3: Server-side Tenant Membership & RBAC Guards.
   - Layer 4: Transaction-local context injection (`app.current_tenant_id`).
   - Layer 5: PostgreSQL Row-Level Security (RLS) with forced policies on restricted database roles.
4. **Least Privilege**: Application database credentials cannot alter schema, bypass RLS, or access administrative tables.

---

## 2. STRIDE Threat Analysis & Mitigations

### 2.1 Spoofing (Identity & Tenant Impersonation)
- **Threat**: Attacker sends requests with another organization's `tenantId` in request headers or JSON payloads.
- **Mitigation**:
  - The `TenantContextInterceptor` resolves the authenticated user's active membership.
  - If the user does not possess an `ACTIVE` membership in the requested tenant, the request is immediately rejected with `403 Forbidden`.
  - All database queries bind the verified tenant ID extracted from server-validated session context.

### 2.2 Tampering (Cross-Tenant Data Modification)
- **Threat**: An authorized user in Tenant A attempts an update (`PATCH /api/v1/documents/:id`) where `:id` belongs to Tenant B.
- **Mitigation**:
  - PostgreSQL Row-Level Security enforces `WITH CHECK (tenant_id = current_tenant_id)` on `INSERT` and `UPDATE` statements.
  - Queries targeting records with a mismatched `tenant_id` behave as if the record does not exist (returning 0 updated rows or 404).

### 2.3 Repudiation (Untracked Actions & Changes)
- **Threat**: A rogue tenant admin deletes critical files or modifies permissions, and denies having done so.
- **Mitigation**:
  - An append-only `audit_logs` table records every sensitive action (membership changes, role modifications, AI budget updates, document deletions).
  - Audit records capture `tenant_id`, `actor_id`, `action`, `resource_type`, `resource_id`, `ip_address`, `user_agent`, and `changes` (JSON diff).
  - Audit log entries cannot be modified or deleted via standard application APIs.

### 2.4 Information Disclosure (Cross-Tenant Leaks)
- **Threat**: Prisma connection pool retains session context across subsequent queries, leaking Tenant A data to Tenant B.
- **Mitigation**:
  - `SET LOCAL app.current_tenant_id` is executed inside a transaction block (`$transaction`). In PostgreSQL, `SET LOCAL` is automatically rolled back / reset when the transaction commits or aborts.
  - Tests verify that subsequent queries on the same pooled connection without a set tenant ID return zero rows.

### 2.5 Denial of Service (Noisy Neighbor / AI Budget Depletion)
- **Threat**: A single tenant monopolizes database connections, worker queues, or drains the company's LLM API budget.
- **Mitigation**:
  - Strict rate limiting per tenant.
  - Per-tenant monthly AI token quotas and configurable budgets in `tenant_quotas`.
  - Background worker concurrency limits per tenant.
  - ClickHouse query timeouts (5 seconds hard limit) and memory limits.

### 2.6 Elevation of Privilege (Platform vs. Tenant Admin)
- **Threat**: A Tenant Administrator gains access to platform-wide administration endpoints (`/api/v1/admin/platform/*`).
- **Mitigation**:
  - Distinct platform roles (`PLATFORM_ADMIN`, `PLATFORM_SUPPORT`) separate from tenant roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
  - Platform administrator endpoints require dedicated `PlatformAdminGuard` verifying user-level platform claims, completely independent of tenant membership roles.

### 2.7 Role Tampering & Cross-Tenant Role Association
- **Threat**: An attacker in Tenant A attempts to bind a membership in Tenant B to a privileged role, or assigns roles without tenant ownership.
- **Mitigation**:
  - `membership_roles` table includes `tenant_id` foreign key with forced RLS (`FORCE ROW LEVEL SECURITY`).
  - `TenantMembershipGuard` queries join `membership_roles` on both `membership_id` and `tenant_id`.
  - Mutating operations require server-side verified permissions (`members:manage`, `settings:manage`) validated through `RbacGuard`.

### 2.8 Unvalidated Input / Parameter Pollution & XSS Vectors
- **Threat**: Malicious payloads in branding settings (e.g. `javascript:alert(1)` in colors, phishing URLs in custom domains, path traversal in slugs).
- **Mitigation**:
  - All request bodies are processed through `ZodValidationPipe` bound to strict Zod schemas.
  - Slugs require regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` (3-64 chars).
  - Colors are strictly validated as valid 3/6-digit hex codes (`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`).
  - Custom domains require strict domain format without protocol schemes, spaces, or query parameters.

### 2.9 Self-Serve Dedicated Database Infrastructure Exploitation
- **Threat**: Standard user requests `placementMode: 'DEDICATED'` to allocate expensive physical database instances without enterprise contract authorization.
- **Mitigation**:
  - `TenantsService.createTenant` enforces a hard security check: `placementMode === 'DEDICATED'` throws `ForbiddenException` unless the authenticated context is verified as a platform administrator.

---

## 3. AI Security & Guardrails

### 3.1 Untrusted Document Ingestion (RAG)
- Uploaded files are scanned for MIME type conformity and size bounds.
- Document text is sanitized before chunking.
- Stored vector embeddings are indexed with `tenant_id` as a required metadata filter in `pgvector`.
- Vector similarity search strictly appends `WHERE tenant_id = :current_tenant_id`.

### 3.2 Prompt Injection & Tool Poisoning
- Retrieved document context is demarcated within structured system tags and explicitly flagged as untrusted data in the LLM system prompt.
- LLM instructions explicitly prohibit retrieved text from overriding system policies or triggering tool executions.
- Tools require explicit human approval for any mutating or destructive actions.

### 3.3 Natural-Language-to-SQL Guardrails
- LLM is provided solely with a pre-approved schema catalog of analytical views.
- Generated SQL is passed through a strict SQL AST validator:
  - Must be a single `SELECT` statement.
  - Strictly no `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `EXEC`, or `GRANT`.
  - No access to system catalogs (`information_schema`, `system.*`, `pg_catalog`).
  - Tenant ID filter is injected into the AST programmatically by the server.
- Executed against a ClickHouse database user with `READONLY = 1`.

# Architecture Decision Records (ADRs)

## ADR-001: Monorepo Architecture with pnpm Workspaces & Turborepo

### Context
The platform requires coordination between a frontend web application, an API service, a background processing worker, a Python AI/ML microservice, and shared TypeScript domain packages (`ui`, `types`, `config`).

### Decision
Adopt `pnpm` workspaces for dependency deduplication and strict package isolation, orchestrated with `Turborepo` for incremental builds, dependency hashing, and pipeline execution.

### Consequences
- **Positive**: Strict boundary enforcement; code sharing without publishing to npm; atomic commits spanning frontend and backend; fast cached builds.
- **Negative**: Requires engineers to understand monorepo dependency graph and workspace protocols (`workspace:*`).

---

## ADR-002: PostgreSQL Row-Level Security (RLS) with Transaction-Local Session Context

### Context
Multi-tenant security requires hard boundaries preventing cross-tenant data leaks. Relying solely on application-level `where: { tenantId }` in queries is prone to developer oversight and catastrophic data breaches.

### Decision
1. Enforce PostgreSQL Row-Level Security (`ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`) on all tenant-owned tables.
2. The application database user (`saas_app_user`) is created without `BYPASSRLS` or `SUPERUSER`.
3. The NestJS backend establishes tenant context inside a dedicated transaction block using:
   ```sql
   SET LOCAL app.current_tenant_id = '<tenant_id>';
   ```
4. Policies strictly verify:
   ```sql
   tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
   ```

### Consequences
- **Positive**: Defense-in-depth: even if a developer omits a `WHERE tenant_id = ...` clause in an ORM query, PostgreSQL rejects cross-tenant reads and writes at the engine level. `SET LOCAL` automatically clears on transaction end, preventing connection pool contamination.
- **Negative**: Queries must execute within transaction wrappers or explicit scoped connections. Database migrations must explicitly define security policies alongside table schemas.

---

## ADR-003: Hybrid Database Placement Model (Shared vs. Dedicated)

### Context
Standard SaaS customers (100–1,000 tenants) need cost-effective shared infrastructure, while enterprise tier customers require physical database isolation for strict compliance (e.g. HIPAA, dedicated encryption keys, custom backup schedules).

### Decision
Implement a `TenantDataPlacement` registry entity that records whether a tenant is in `SHARED` or `DEDICATED` placement mode. A server-side `DataPlacementRouter` manages a pool of Prisma clients and routes database transactions dynamically based on the verified tenant context.

### Consequences
- **Positive**: Single codebase supports both SMB and Tier-1 Enterprise isolation requirements without architectural branching.
- **Negative**: Connection pooling must be carefully managed to avoid exhausting database file descriptors across multiple dedicated databases.

---

## ADR-004: Transactional Outbox Pattern for Real-Time Analytical Event Ingestion

### Context
Business operations must reliably emit analytical events to ClickHouse without dual-write inconsistencies (e.g., database commit succeeds but message publishing fails, or vice-versa).

### Decision
Use the Transactional Outbox pattern:
1. Every business mutation records both the entity change and an entry in the `business_events` outbox table within the same PostgreSQL transaction.
2. A resilient BullMQ worker polls unpublished events with `SELECT ... FOR UPDATE SKIP LOCKED`, batches them, inserts them into ClickHouse, and marks them published.
3. Consumers use idempotent event IDs for deduplication.

### Consequences
- **Positive**: Zero loss of business events; no distributed two-phase commit overhead; consistent ordering per tenant.
- **Negative**: Small near-real-time lag (typically 200–500ms) between transactional commit and ClickHouse query availability.

---

## ADR-005: Dual-Engine AI Architecture (NestJS Gateway + FastAPI ML Service)

### Context
AI workloads fall into two categories:
1. Real-time I/O-bound LLM orchestration, streaming chat, and RAG document routing (ideal for TypeScript/Node.js).
2. Compute-heavy numerical inference, tabular anomaly detection, model training, and Python ML ecosystem dependencies (NumPy, Scikit-learn, PyTorch).

### Decision
Split AI functionality into:
- `apps/api` (NestJS): AI Gateway for tenant authentication, provider routing, budget tracking, token counting, and streaming SSE responses.
- `apps/ai-service` (FastAPI): Dedicated microservice for predictive models, ML anomaly scoring, model evaluation, and NL-to-SQL AST validation.

### Consequences
- **Positive**: Optimal runtime performance for each task; isolates heavy Python dependencies from high-concurrency API server.
- **Negative**: Adds an internal HTTP/gRPC network hop between the API gateway and the Python service.

---

## ADR-006: Read-Only ClickHouse Identity for Natural-Language-to-SQL

### Context
Users should be able to ask analytical questions in natural language and receive SQL-backed charts. However, executing LLM-generated SQL against primary transactional databases is a severe security risk.

### Decision
1. NL-to-SQL operates exclusively against ClickHouse reporting views, never against transactional PostgreSQL.
2. ClickHouse user has strict `READONLY = 1` permissions.
3. An allowlist catalog restricts query generation to verified analytical tables and metrics.
4. Tenant ID filtering is injected deterministically by the backend parser, never entrusted to the LLM.
5. Strict execution limits: 5-second timeout and 1,000 maximum rows.

### Consequences
- **Positive**: Absolute immunity of core transactional data; zero risk of unauthorized writes or schema changes; hard multi-tenant isolation.
- **Negative**: Queries are limited to historical analytical dimensions present in ClickHouse.

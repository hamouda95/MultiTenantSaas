# System Architecture Overview

## 1. System Vision & Purpose

This platform is a production-grade, multi-tenant B2B SaaS architecture designed to support 100–1,000 customer organizations. Each tenant is provided with strict data isolation, configurable branding and modules, fine-grained role-based access control (RBAC), analytical telemetry, and secure enterprise AI capabilities.

The platform balances operational efficiency (via shared infrastructure with PostgreSQL Row-Level Security) with enterprise compliance needs (via dedicated database placement for tier-1 enterprises).

---

## 2. High-Level Architecture Topology

```
+---------------------------------------------------------------------------------------------------+
|                                        Client Tier                                                |
|   Next.js 14+ App Router (apps/web) - React, Tailwind CSS, TanStack Query, shadcn/ui Design System|
+-------------------------------------------------+-------------------------------------------------+
                                                  | HTTPS / REST / OpenAPI / SSE Streaming
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                        API Gateway & Core Service                                 |
|                                        NestJS Modular Monolith (apps/api)                        |
|                                                                                                   |
|  [TenantContext Middleware] -> [AuthGuard / OIDC] -> [TenantMembershipGuard] -> [RBACGuard]       |
|                                                                                                   |
|  Domains:                                                                                         |
|  - Identity & Auth          - Tenants & Memberships     - Roles & Permissions                     |
|  - Settings & Branding      - Entitlements & Quotas     - Business Operations                     |
|  - Audit Logging            - Outbox Publisher          - AI Gateway (Routing & Budgets)          |
+-------------------+-----------------------------+-------------------------------+-----------------+
                    |                             |                               |
     Transaction    | Transactional               | REST / gRPC                   | Asynchronous
     Scoped Queries | Outbox Events               |                               | Job Enqueueing
                    v                             v                               v
+-----------------------------+     +-----------------------------+     +---------------------------+
| Primary Database: PostgreSQL|     | AI/ML Service: FastAPI      |     | Redis & BullMQ Workers    |
| - Row-Level Security (RLS)  |     | (apps/ai-service)           |     | (apps/worker)             |
| - UUID v4 Primary Keys      |     | - Predictive Analytics      |     | - Document Chunking & Emb.|
| - Transaction-Local Context |     | - ML Anomaly Detection      |     | - Outbox Event Dispatch   |
|   (app.current_tenant_id)   |     | - NL-to-SQL Query Parser    |     | - Notification Delivery   |
| - pgvector for Embeddings   |     | - Model Drift Monitoring    |     | - Audit Reconciliation    |
+-----------------------------+     +--------------+--------------+     +-------------+-------------+
                                                   |                                  |
                                                   | Read-Only Analytical Queries     | Analytical Event
                                                   | Against Approved Schema Catalog  | Ingestion
                                                   v                                  v
                                    +---------------------------------------------------------------+
                                    | ClickHouse Real-Time Analytics Cluster                         |
                                    | - Analytical Events Table (tenant_id partitioned)             |
                                    | - AggregatingMergeTree Materialized Views                     |
                                    | - Strictly Scoped Reporting Views                             |
                                    +---------------------------------------------------------------+
```

---

## 3. Monorepo Structure

The codebase is organized as a clean TypeScript-first monorepo using `pnpm` workspaces and `Turborepo`:

```
enterprise-saas-platform/
├── apps/
│   ├── web/                 # Next.js frontend (App router, shadcn/ui, TanStack Query)
│   ├── api/                 # NestJS core API (REST, OpenAPI, Prisma, RLS engine)
│   ├── ai-service/          # Python/FastAPI AI/ML service (Predictive models, NL-to-SQL compiler)
│   └── worker/              # BullMQ background worker (Outbox relay, document processing)
├── packages/
│   ├── ui/                  # Reusable accessible component library & design tokens
│   ├── types/               # Shared domain contracts, DTOs, event schemas, API types
│   └── config/              # Shared ESLint, Prettier, and TypeScript configurations
├── infra/
│   ├── docker/              # Local multi-service topology (Postgres, ClickHouse, Redis, MinIO)
│   ├── migrations/          # Versioned SQL migrations for schema and explicit RLS policies
│   └── scripts/             # Seed scripts, security audit scripts, tenant provisioning
└── docs/
    ├── architecture/        # Overview, design decisions (ADRs)
    ├── security/            # Threat model, RLS security boundary, audit protocols
    └── development/         # Roadmap, local setup guide, verification steps
```

---

## 4. Multi-Tenant Data Isolation Strategy

Data isolation is enforced at the database layer using a dual-mode hybrid architecture:

### 4.1 Mode A: Shared Database with PostgreSQL RLS (Default)
1. **Application Connection**: The application connects using a least-privilege PostgreSQL user (`saas_app_user`) that does **not** possess the `BYPASSRLS` or `SUPERUSER` attributes.
2. **Session / Transaction Isolation**: Every query executing on behalf of a tenant sets transaction-local configuration:
   ```sql
   SET LOCAL app.current_tenant_id = '<tenant_uuid>';
   ```
3. **Database Security Policy**:
   ```sql
   ALTER TABLE "<table_name>" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "<table_name>" FORCE ROW LEVEL SECURITY;

   CREATE POLICY tenant_isolation_policy ON "<table_name>"
     FOR ALL
     USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
     WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
   ```
4. **Connection Pool Safety**: `SET LOCAL` automatically clears at `COMMIT` or `ROLLBACK`, guaranteeing that dirty state never bleeds into pooled connections for subsequent requests.

### 4.2 Mode B: Dedicated Database (Enterprise Tier)
- Enterprise customers requiring complete physical infrastructure separation are routed via the `TenantDataPlacement` registry.
- NestJS data access routing selects the dedicated database connection pool based on the verified tenant identifier, executing identical migration scripts and domain logic.

---

## 5. Five Core AI Capabilities

1. **Conversational AI Assistant**:
   - Multi-turn conversation management with streaming responses.
   - Tenant-scoped memory, token quota enforcement, and budget limits.
2. **Retrieval-Augmented Generation (RAG)**:
   - Untrusted document parsing, text extraction, and semantic chunking.
   - Vector storage in PostgreSQL via `pgvector` with mandatory tenant and document permission filtering.
   - Citations and provenance tracking for every answer.
3. **Predictive Analytics & Anomaly Detection**:
   - Hosted in `apps/ai-service` with standardized feature preparation.
   - Baseline statistical model and drift evaluation metrics.
4. **Controlled AI Agents with Human Approval**:
   - Strict allowlisted tool catalogue with declarative Zod schemas.
   - Human-in-the-loop approval workflow for mutating actions.
   - Full audit trail recording tool invocations, inputs, and results.
5. **Natural-Language-to-SQL**:
   - Executed strictly against a designated read-only ClickHouse role.
   - Query parser validates against an allowlisted view/column catalog.
   - Hard execution limits: timeout (5s), max row limit (1,000), and mandatory tenant filtering.
   - Never executed against transactional PostgreSQL.

---

## 6. Real-Time Analytics Pipeline

1. **Business Transaction**: NestJS service writes the operational record and a `BusinessEvent` outbox record inside the same atomic PostgreSQL transaction.
2. **Outbox Processor**: `apps/worker` polls the outbox using `SELECT ... FOR UPDATE SKIP LOCKED` and publishes to ClickHouse with idempotent message IDs.
3. **ClickHouse Ingestion**: Events are inserted into tenant-partitioned ClickHouse tables.
4. **Reporting Queries**: NestJS retrieves aggregated analytics using strictly parameterized tenant-scoped queries with freshness metrics.

# Implementation Roadmap & Verification Gates

## Phase 0: Architecture, Threat Model & Project Scaffolding [COMPLETED]
- [x] Inspect workspace and environment tooling (Node.js LTS, pnpm).
- [x] Create Architecture Overview (`docs/architecture/overview.md`).
- [x] Create Architecture Decisions (`docs/architecture/decisions.md`).
- [x] Create Security & Threat Model (`docs/security/threat-model.md`).
- [x] Create Roadmap & Acceptance Criteria (`docs/development/roadmap.md`).
- [x] Initialize monorepo structure (`pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`).

## Phase 1: Working Multi-Tenant Foundation & RLS Engine [COMPLETED]
- [x] Define shared domain types (`packages/types`).
- [x] Configure Docker Compose for local infrastructure:
  - PostgreSQL 16 with `pgvector`
  - Redis 7 for BullMQ queues
  - ClickHouse for analytical telemetry
  - MinIO for S3-compatible document storage
- [x] Author schema and versioned SQL migrations (`00_init_roles_and_extensions.sql`, `01_schema_and_rls.sql`):
  - 20 domain entities with UUIDs, indexes, and foreign keys.
  - Database roles: `saas_admin` (schema migrations) and `saas_app_user` (runtime role with `NOBYPASSRLS`).
  - Row-Level Security policies with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on all 17 tenant-owned tables including `membership_roles`.
  - Transaction-local tenant context helper functions (`app.current_tenant_id`).
- [x] Implement NestJS backend core (`apps/api`):
  - AsyncLocalStorage Tenant Context & Middleware.
  - Authentication boundary (JWT issuance, claims validation).
  - Server-side tenant membership resolution (`TenantMembershipGuard`).
  - Strict RBAC authorization guards (`RbacGuard` + `@RequirePermissions`).
  - Safe transaction-local RLS engine (`RlsPostgresService`).
  - Hybrid data placement routing abstraction (`TenantDataPlacementRegistry`).
  - Strict runtime input validation via Zod schemas (`ZodValidationPipe`).
- [x] Automated Test Suite:
  - Unit tests for domain logic, RBAC checks, and context propagation.
  - Multi-tenant isolation integration tests (proving Tenant A cannot access Tenant B resources).
  - Negative tests verifying RLS blocks queries when tenant context is omitted or forged.
  - Security regression suite (Zod validation, placement gates, role isolation).
  - 32/32 tests passing across 6 suites.

## Phase 2: SaaS Product Foundation & User Experience
- [ ] Shared UI component library (`packages/ui`) with design tokens and CSS variables.
- [ ] Next.js 14+ frontend (`apps/web`):
  - Authentication and organization switcher.
  - Workspace dashboard with tenant-specific branding (logos, primary colors).
  - User and membership management with tenant RBAC.
  - Module entitlement toggles and quota overview.
  - Audit log viewer.

## Phase 3: Real-Time Analytics Pipeline
- [ ] Transactional Outbox implementation in NestJS.
- [ ] BullMQ background worker in `apps/worker` to process outbox events.
- [ ] ClickHouse schema definition and idempotent ingestion consumer.
- [ ] Analytical reporting endpoints with tenant-scoped SQL queries.
- [ ] Real-time dashboard with metrics, pipeline lag monitoring, and date filters.

## Phase 4: AI Gateway & Secure RAG
- [ ] AI Gateway module with token quotas, budget enforcement, and provider routing.
- [ ] Local mock LLM provider for reproducible offline execution.
- [ ] Document management with private object storage (MinIO/S3).
- [ ] Document chunking, vector embedding, and `pgvector` indexing.
- [ ] Multi-tenant RAG pipeline with document permission checks and source citations.

## Phase 5: Advanced AI Capabilities
- [ ] Python/FastAPI service (`apps/ai-service`) with evaluated predictive model.
- [ ] Natural-Language-to-SQL compiler with allowlisted catalog and read-only ClickHouse role.
- [ ] AI Agent execution engine with allowlisted tools, schemas, and human approval workflow.

## Phase 6: Hardening, Observability & Production Readiness
- [ ] OpenTelemetry-compatible structured logging and trace context propagation.
- [ ] Comprehensive negative security tests and stress tests.
- [ ] Production build and CI workflows (`.github/workflows/ci.yml`).
- [ ] Disaster recovery, backup/restore, and tenant offboarding documentation.

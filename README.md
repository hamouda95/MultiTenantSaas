# Enterprise Multi-Tenant B2B SaaS Platform

A production-grade, multi-tenant B2B SaaS foundation with strict database Row-Level Security (RLS), hybrid shared/dedicated data placement, transactional event outbox, and enterprise AI capabilities.

---

## 1. Architecture Highlights

- **TypeScript Monorepo**: Managed via `pnpm` workspaces and `Turborepo`.
- **Backend**: NestJS modular architecture with REST, OpenAPI (`/api/docs`), and AsyncLocalStorage tenant context.
- **Database & Tenant Security**:
  - PostgreSQL 16 with Row-Level Security (`ENABLE ROW LEVEL SECURITY` & `FORCE ROW LEVEL SECURITY`).
  - Transaction-local context injection (`SET LOCAL app.current_tenant_id = $1`).
  - Dedicated least-privilege application role `saas_app_user` with `NOBYPASSRLS`.
- **Hybrid Data Placement**:
  - `SHARED` mode: RLS-isolated shared tables.
  - `DEDICATED` mode: Server-side routing to isolated physical databases for enterprise compliance.
- **Analytics & Outbox**:
  - Transactional Outbox pattern emitting business events to ClickHouse.
- **AI Gateway & Capabilities**:
  - Tenant token quotas and monthly cost budgets.
  - Local mock provider fallback for offline testing.
  - RAG document ingestion with `pgvector` embeddings.
  - Read-only ClickHouse identity for Natural-Language-to-SQL.

---

## 2. Directory Structure

```
enterprise-saas-platform/
├── apps/
│   ├── web/                     # Next.js 14 frontend (App Router, Tailwind CSS, shadcn/ui)
│   ├── api/                     # NestJS backend API with RLS engine
│   ├── ai-service/              # Python/FastAPI ML & predictive services
│   └── worker/                  # BullMQ background worker for Outbox & RAG processing
├── packages/
│   ├── ui/                      # Shared design tokens & UI components
│   ├── types/                   # Shared domain contracts, DTOs, and event schemas
│   └── config/                  # Shared tooling, ESLint, and Prettier configs
├── infra/
│   ├── docker/                  # Docker Compose (Postgres+pgvector, Redis, ClickHouse, MinIO)
│   ├── migrations/              # Versioned SQL migrations and explicit RLS policies
│   └── scripts/                 # Provisioning and seed scripts
├── docs/
│   ├── architecture/            # Overview, ADRs (Decisions)
│   ├── security/                # Threat model and RLS boundary
│   └── development/             # Roadmap, verification gates, local setup
└── .github/workflows/ci.yml     # Continuous Integration pipeline
```

---

## 3. Quick Start & Local Setup

### 3.1 Prerequisites
- Node.js 20+ LTS
- pnpm 9+
- Docker & Docker Compose (optional for live databases)

### 3.2 Install Dependencies
```bash
pnpm install
```

### 3.3 Start Local Infrastructure
```bash
cd infra/docker
docker compose up -d
```

### 3.4 Build Packages
```bash
pnpm --filter @saas/types build
pnpm --filter @saas/api build
```

### 3.5 Run Multi-Tenant Verification Tests
```bash
pnpm --filter @saas/api test
```

### 3.6 Start API Development Server
```bash
pnpm --filter @saas/api dev
```
Open [http://localhost:4000/api/docs](http://localhost:4000/api/docs) to explore the OpenAPI documentation.

---

## 4. Automated Verification Results

| Suite | Status | Focus |
|---|---|---|
| `test/tenant-context.spec.ts` | **PASS (4/4)** | AsyncLocalStorage context isolation across asynchronous boundaries |
| `test/tenant-isolation-rls.spec.ts` | **PASS (3/3)** | Proves Tenant A cannot read/target Tenant B resources; connection pool reset |
| `test/guards.spec.ts` | **PASS (8/8)** | Membership guard, RBAC permission resolution, Platform admin separation |
| `test/hybrid-placement.spec.ts` | **PASS (3/3)** | Dynamic connection routing for SHARED vs DEDICATED enterprise tenants |
| `test/security-regressions.spec.ts` | **PASS (9/9)** | Zod validation, XSS/injection prevention, placement authorization gates, RLS on membership_roles |
| `test/e2e-api.spec.ts` | **PASS (5/5)** | Full lifecycle: provisioning, branding CSS variables, quotas, audit, outbox |
| **Total** | **PASS (32/32)** | Zero regressions, 100% passing build |

---

## 5. Security & Isolation Controls Audited

1. **PostgreSQL RLS with App User Role**: Enforced on all 17 tenant-scoped tables including `membership_roles`. The runtime role `saas_app_user` has `NOBYPASSRLS`.
2. **Context Leak Prevention**: Transaction-local `SET LOCAL app.current_tenant_id = $1` automatically resets on transaction completion, preventing pooled connection contamination.
3. **RBAC & Authorization Guards**: Every mutating endpoint enforces `@RequirePermissions(...)` checked via trusted server-side membership and role permissions.
4. **Input Sanitization**: All DTOs validated strictly via `ZodValidationPipe`, disallowing invalid slugs, malformed URLs, and non-hex colors.
5. **Dedicated Database Placement Gate**: Dedicated physical infrastructure allocation is strictly gated behind platform administrator authorization.

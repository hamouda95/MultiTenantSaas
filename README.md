# MultiTenantSaas

NestJS + Next.js workspace application with the uploaded Claude interface, French UI, tenant branding, PostgreSQL RLS, cookie sessions, invitations and role-based access.

## Working features

- Register, password login, persisted HttpOnly session, logout with server-side revocation; suspended accounts are rejected on every request.
- Create and switch workspaces. Creation atomically provisions branding, quotas, roles, owner membership and five module entitlements.
- Dashboard reads live member counts, token/cost quotas, enabled modules and audit events.
- Invite members with expiring single-use links, accept as the matching account, change roles and remove members. Seat limits and last-owner protection run under a workspace lock.
- Persist branding, logo URL, theme and domain metadata; enable/disable supported module entitlements; view immutable audit history.
- Route/header tenant matching, membership checks, RBAC, transaction-local RLS and composite foreign keys protect tenant boundaries.

## Development

Use Node 22, pnpm 9.15.9 and PostgreSQL 16 with pgvector. `pnpm install --frozen-lockfile`, then `pnpm build` and `pnpm type-check`.

Copy `.env.example` to `.env`, set independent credentials and a random JWT secret, initialize PostgreSQL with `infra/docker/init-database.sh` and all migrations, then run `pnpm dev`. The API is on port 4000, Swagger at `/api/docs`, and the frontend on port 3000. If the database runs in Docker, expose port 5432 only to localhost for host-based development. `apps/web/.env.local` can set `API_INTERNAL_URL`; the default is `http://localhost:4000`.

The browser uses a same-origin Next.js proxy. No bearer token is stored in browser JavaScript storage. Use the invited email when registering through an invitation link; existing accounts should log in instead. Owners copy the generated link and send it privately. Email delivery is not configured.

## Verification

```sh
pnpm build
pnpm type-check
pnpm test
# Against an initialized, disposable PostgreSQL database with both URLs set:
pnpm --filter @saas/api test:integration
```

The default suite has 35 tests using mocks/the legacy test-only SQL emulator, plus seven explicitly skipped live database tests. Only the separate live suite validates actual PostgreSQL policies and HTTP lifecycle behavior. CI provisions pgvector, applies migrations, runs both suites and builds both Docker targets. See [validation notes](docs/development/integration-validation.md) for actual results and environment limitations.

## Deployment

See [deployment guide](docs/development/deployment.md). Root `compose.yml` runs the database, API and frontend, with only the frontend bound to localhost. Production requires an HTTPS reverse proxy and secure random credentials. No deployment is performed by this change.

## Roles

| Capability | Owner | Member | Viewer |
| --- | --- | --- | --- |
| Dashboard, members, branding, quotas, module list | Yes | Yes | Yes |
| Manage members, settings, module entitlements | Yes | No | No |
| Audit history | Yes | No | No |
| Document read permission | Yes | Yes | Yes |
| Document write and AI use permissions | Yes | Yes | No |

Document/AI permissions are reserved for future services; their presence does not implement those services. The server remains authoritative; restricted API responses appear as permission errors in the interface.

## Explicit boundaries

AI chat execution, RAG ingestion, prediction, agents, NL-to-SQL, file storage and outbox delivery workers are not implemented in this repository. The module screen manages their entitlements only. Provider credentials alone will not add these services. Custom domains are saved metadata; DNS/TLS provisioning is external. Dedicated database routing is scaffolded but not connected to runtime queries, so production workspace creation rejects dedicated placement. Password reset and email ownership verification also require a mail/identity integration. Existing passwordless development accounts cannot log in until securely migrated by an operator; there is no email-only compatibility bypass.

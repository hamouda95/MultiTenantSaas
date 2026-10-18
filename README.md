# MultiTenantSaas

NestJS 11 + Next.js 15 workspace application with the uploaded Claude interface, French UI, tenant branding, PostgreSQL RLS, cookie sessions, invitations and role-based access.

## Holding business management

Workspaces now act as holdings with separate companies. Open **Gestion du holding** to configure Polaris, its stores and warehouse, then run purchases/imports, inventory, sales and recorded bank/cash operations with payables/receivables. Rule-based replenishment and a 30-day cash scenario explain their assumptions. Company grants are enforced server-side. The existing French design is retained.

This is a working business pilot, **not a complete ERP**: live banking/POS, statutory accounting/tax, payroll, advanced AI and intercompany consolidation are not implemented. Read the [business scope, walkthrough and limits](docs/development/holding-business.md).

Existing local install: `git pull --ff-only origin feat/claude-frontend-integration`, then `./scripts/local.sh`. The launcher applies additive migration 05 and preserves your database.

## Working platform features

- Register, password login, persisted HttpOnly session, logout with server-side revocation; suspended accounts are rejected on every request.
- Create and switch workspaces. Creation atomically provisions branding, quotas, roles, owner membership and five module entitlements.
- Dashboard reads live member counts, token/cost quotas, enabled modules and audit events.
- Invite members with expiring single-use links, accept as the matching account, change roles and remove members. Seat limits and last-owner protection run under a workspace lock.
- Persist branding, logo URL, theme and domain metadata; enable/disable supported module entitlements; view immutable audit history.
- Route/header tenant matching, membership checks, RBAC, transaction-local RLS and composite foreign keys protect tenant boundaries.

## Run the real app on your MacBook

Install and open [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/), then run:

```sh
git clone --branch feat/claude-frontend-integration https://github.com/hamouda95/MultiTenantSaas.git
cd MultiTenantSaas
./scripts/local.sh
```

Open **http://localhost:3000** and choose **Créer un compte**. This runs the actual frontend, NestJS API and PostgreSQL locally. Node.js and pnpm do not need to be installed on your Mac. The first build can take several minutes.

The launcher generates independent credentials in ignored `.env.local-docker`, uses a separate local Docker project/volume, and opens the app on macOS. Keep that file: restarting reuses it and your database. `./scripts/local.sh stop` stops the containers and preserves data; `./scripts/local.sh logs` shows logs. Port 3000 must be free.

`compose.local.yml` enables HTTP session cookies **for localhost only**; production Compose retains secure cookies and requires HTTPS. No production services or demo data are involved. Native Apple Silicon/macOS execution has not been tested in this workspace.

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

The default suite has 42 tests using domain rules/mocks/the legacy test-only SQL emulator, plus eight explicitly skipped live database tests. Only the separate live suite validates actual PostgreSQL policies and HTTP lifecycle behavior. CI provisions pgvector, applies migrations, runs both suites and builds both Docker targets. See [validation notes](docs/development/integration-validation.md) for actual results and environment limitations.

## Deployment

See [deployment guide](docs/development/deployment.md). Root `compose.yml` runs the database, API and frontend, with only the frontend bound to localhost. Production requires an HTTPS reverse proxy and secure random credentials. No deployment is performed by this change.

## Roles

| Capability                                        | Owner | Member | Viewer |
| ------------------------------------------------- | ----- | ------ | ------ |
| Dashboard, members, branding, quotas, module list | Yes   | Yes    | Yes    |
| Manage members, settings, module entitlements     | Yes   | No     | No     |
| Audit history                                     | Yes   | No     | No     |
| Document read permission                          | Yes   | Yes    | Yes    |
| Document write and AI use permissions             | Yes   | Yes    | No     |

Document/AI permissions are reserved for future services; their presence does not implement those services. The server remains authoritative; restricted API responses appear as permission errors in the interface.

## Explicit boundaries

AI chat execution, RAG ingestion, prediction, agents, NL-to-SQL, file storage and outbox delivery workers are not implemented in this repository. The module screen manages their entitlements only. Provider credentials alone will not add these services. Custom domains are saved metadata; DNS/TLS provisioning is external. Dedicated database routing is scaffolded but not connected to runtime queries, so production workspace creation rejects dedicated placement. Password reset and email ownership verification also require a mail/identity integration. Existing passwordless development accounts cannot log in until securely migrated by an operator; there is no email-only compatibility bypass.

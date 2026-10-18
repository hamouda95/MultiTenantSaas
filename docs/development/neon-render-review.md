# Repository and deployment review — 18 October 2026

## Scope and evidence

Reviewed current `main` at `075eba4226d0948555e880e9e22e92c3a77ac57b`, its application contracts, authentication/guards, database access, business transactions, frontend requests, deployment files and CI. Type checking/builds cover the application tree; focused manual review covers security, lifecycle, exports and POS. This is not a claim of formal verification of every line or a complete commercial ERP.

The MacBook Desktop is not mounted in this environment. No Desktop-only source or uncommitted Mac changes were available for comparison. Attach that code or push it to a branch to include it in the review.

## Actual connected deployment findings

| Check                               | Observed result                                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render workspace                    | User confirmed `multitenantsaas-api-test`                                                                                                                                               |
| Service                             | `multitenantsaas-api-test`, Frankfurt, native Node runtime, branch `main`                                                                                                               |
| Latest deployment                   | `dep-dba45rm1egvs7399t5ig`, status `live`, commit `075eba4`, completed 2026-10-18 03:55 UTC                                                                                             |
| Prior attempts                      | Four earlier build failures; superseded by the live deployment                                                                                                                          |
| Build/start                         | Builds shared types and API only; starts `apps/api/dist/main.js`                                                                                                                        |
| Frontend deployment                 | No Next.js service listed in this workspace; current service does not start the frontend                                                                                                |
| Render health-check path            | Empty, so a live deployment record is not proof of database/business readiness                                                                                                          |
| Public HTTP smoke                   | `/health/live`, `/health/ready`, `/api/v1/auth/me`, `/login` timed out from the review environment; public retrieval also unavailable. Current public reachability remains unverified   |
| Neon project                        | `multitenantsaas-test`, PostgreSQL 18, Frankfurt                                                                                                                                        |
| Neon `production` branch            | No application tables in `neondb`                                                                                                                                                       |
| Neon `saas-integration-test` branch | Application tables, business ledger, sessions/invitations present; tenant tables enforce and FORCE RLS                                                                                  |
| `saas_runtime`                      | SQL-created, not superuser/BYPASSRLS/CREATEROLE; direct read-only connection confirmed zero unscoped settings/ledgers, no auth-session SELECT, no audit UPDATE                          |
| `saas_app_user`                     | Has BYPASSRLS and CREATEROLE in the integration branch. Must not be used for tenant-scoped runtime queries. Presence alone does not establish which Render environment variable uses it |
| Control role                        | No `saas_control` in the observed Neon branches; the API's existing control connection may use a different elevated role. Connection settings were not read or exposed                  |
| Scheduled snapshots                 | Empty schedule on both observed branches. Project reports six-hour history retention; that is not a tested backup/restore process                                                       |

No live roles/passwords, schema, application records, service settings or deployments were changed during this review. No production migration was applied. Neither app passwords nor provider credentials were printed or committed.

## Fixes prepared in this branch

- Added an optional combined Render target: public Next.js and loopback-only NestJS, with supervised shutdown and startup failure handling. This closes the API-only deployment gap when deployed with the new configuration.
- Added `render.yaml` with `/health/ready` and deploy-after-CI behavior. It creates a combined service; it does not automatically reconfigure your existing native Node service.
- Readiness now checks runtime table access, enforced RLS, absence of unscoped tenant rows and control access to sessions, rather than only pinging the control connection.
- Production startup requires explicit independent runtime/control URLs and rejects runtime DDL/elevated role attributes.
- Added a Neon-compatible least-privilege control-role migration with explicit control policies instead of requiring a superuser. Its password must be provisioned separately by an operator.
- Added a read-only public HTTP checker and an operator-only first-platform-administrator bootstrap command.
- Added administrative lifecycle controls, complete business JSON exports, scoped cashier/store-manager roles and POS transactions.

## Deploy the combined app

For a **new combined Docker service**, use `render.yaml`, supply `WEB_URL` as the exact HTTPS origin and configure independent `DATABASE_URL` (`saas_runtime`) and `DATABASE_MIGRATION_URL` (`saas_control`) for the intended Neon branch/database. JWT_SECRET is generated by the Blueprint. Build from this reviewed branch for testing; merge only after reviewing CI. Do not put database passwords in Git or frontend environment variables.

For the **existing native Node service**, the reviewed build command needs to build Next.js as well:

```sh
corepack pnpm install --frozen-lockfile --prod=false
corepack pnpm build
```

Set the start command to `node scripts/start-render.cjs`, executed from the repository root. It binds Next.js to Render's PORT and API to loopback port 4000, forwarding the exact public origin to the API. Do not switch an existing API client URL blindly: confirm whether clients rely on it before changing the service's routing.

For a Neon database with 00–05 already applied, apply `infra/neon/06_control_role.sql` then `infra/neon/07_administration.sql` as a schema operator after a verified backup/branch test. Set independent passwords for the restricted runtime/control roles through the secret-management workflow. Use verified TLS connection strings (`sslmode=verify-full`). The SQL does not embed live passwords and is not automatically executed by application startup.

For a fresh database, apply the Neon SQL files in order. Migrations 02/03 are one-time migrations, not safe scripts to rerun indiscriminately. `infra/neon/init-ci.sh` is exclusively for a disposable CI database, with hard-coded CI credentials; never run it against a real Neon project.

After deployment:

```sh
node scripts/check-deployment.cjs https://YOUR-SERVICE.onrender.com
```

This checks login, combined readiness and unauthenticated denial without creating records. Then verify a registered test user's login and authorised workflow, tenant/store isolation, exports, backup restoration and monitoring. A `live` status alone is insufficient.

## Remaining release work

No statutory accounting/VAT/fiscal certification, payroll, live payment-terminal/POS/bank connectors, intercompany FX/eliminations, partial receipts/refunds, reservations/in-transit transfers, complete customer notification/recovery flows, LLM assistant or trained predictive models have been implemented. Credentials alone will not implement them. The existing 8 MiB holding JSONB pilot must be normalized/indexed/paginated and load-tested before high-volume retail use. Backup scheduling/restore drills and operational controls also remain deployment work.

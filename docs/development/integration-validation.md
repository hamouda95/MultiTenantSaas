# Integration validation

Local validation, 2026-10-18 (Europe/Paris):

| Check | Result |
| --- | --- |
| Dependency install | Passed after resolving older allowed Rollup 4.64.7; original lock used a release younger than the environment's minimum age |
| NestJS production compilation | Passed |
| Next.js 15.5.28 production compilation and static generation | Passed |
| Workspace TypeScript checks | Passed |
| Production dependency audit | Zero known advisories after NestJS 11 and patched dependency overrides |
| Default test suite | 35 passed; seven real-database cases explicitly skipped |
| PostgreSQL HTTP/RLS integration | Seven passed in GitHub CI against pgvector/PostgreSQL |
| Docker images / Compose runtime | Both images built and Compose stack/frontend/proxy smoke checks passed in GitHub CI |
| Browser interaction / visual comparison | Not verified: Chromium was absent and the browser download returned invalid/truncated archives |

This sandbox has no `/proc`, so Node's `process.memoryUsage()` fails with `uv_resident_set_memory`. The web build and completed test run used a scratch-only Node preload that supplies heap statistics and zero RSS when that diagnostic fails. The preload is not committed or used in Docker/CI and does not alter application behavior. API compilation and TypeScript checks pass directly.

The live test suite uses the compiled Nest application over HTTP and the real restricted PostgreSQL role. It covers password rejection, cookies, session revocation, workspace provisioning, cross-tenant denial, header/path mismatch, CSRF Origin rejection, branding/module persistence, audit creation, invitation identity/replay protection, Viewer mutation denial, last-owner protection, seat limits, removal, RLS context reset, audit immutability and credential-column access denial.

No production database, DNS, TLS certificate, SMTP service, AI provider, object-storage account or deployment host was supplied or accessed. Their absence is not reported as a passing test. AI/storage processing services remain unimplemented, rather than merely untested integrations.

CI successfully validated the integrated stack at commit `6e33a34dd6ff868321e2f9b9b243ead7f9af28f3` ([run](https://github.com/hamouda95/MultiTenantSaas/actions/runs/39080215421)). That run includes frozen installation, both production builds, type checks, 35 default tests, seven live database tests, Docker image builds, database/API health and frontend/proxy smoke checks. The subsequent NestJS 11 security dependency refresh is rerun through the same pipeline; the PR checks are authoritative for the latest commit.

Security refresh: NestJS 11.2.7, matching Nest companion packages, updated Express middleware wildcard syntax, and patched Lodash, JS-YAML, PostCSS, qs and Multer overrides. `pnpm audit --prod` reports zero known advisories on the updated lockfile. CI rejects high/critical production dependency advisories.

# Integration validation

Local validation, 2026-10-18 (Europe/Paris):

| Check | Result |
| --- | --- |
| Dependency install | Passed after resolving older allowed Rollup 4.64.7; original lock used a release younger than the environment's minimum age |
| NestJS production compilation | Passed |
| Next.js 15.5.28 production compilation and static generation | Passed |
| Workspace TypeScript checks | Passed |
| Default test suite | 35 passed; seven real-database cases explicitly skipped |
| PostgreSQL HTTP/RLS integration | Added; not runnable locally without PostgreSQL |
| Docker images / Compose runtime | Added to CI; Docker is unavailable locally |
| Browser interaction / visual comparison | Not yet verified |

This sandbox has no `/proc`, so Node's `process.memoryUsage()` fails with `uv_resident_set_memory`. The web build and completed test run used a scratch-only Node preload that supplies heap statistics and zero RSS when that diagnostic fails. The preload is not committed or used in Docker/CI and does not alter application behavior. API compilation and TypeScript checks pass directly.

The live test suite uses the compiled Nest application over HTTP and the real restricted PostgreSQL role. It covers password rejection, cookies, session revocation, workspace provisioning, cross-tenant denial, header/path mismatch, CSRF Origin rejection, branding/module persistence, audit creation, invitation identity/replay protection, Viewer mutation denial, last-owner protection, seat limits, removal, RLS context reset, audit immutability and credential-column access denial.

No production database, DNS, TLS certificate, SMTP service, AI provider, object-storage account or deployment host was supplied or accessed. Their absence is not reported as a passing test. AI/storage processing services remain unimplemented, rather than merely untested integrations.

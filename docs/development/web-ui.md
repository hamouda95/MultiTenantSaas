# Web UI

The uploaded Claude design lives in `apps/web`, using the App Router, Tailwind, shared UI components and React Query. The visual tokens, responsive shell, French copy, tenant theming, forms and loading/error states were retained. Added registration, invitation acceptance, role selection and member removal reuse the same components.

`pnpm --filter @saas/web dev` starts port 3000. Set `API_INTERNAL_URL` server-side if Nest does not run on localhost:4000. All browser calls use `/api/v1` through the Next.js route handler. Sessions are HttpOnly cookies; localStorage stores only the last workspace ID.

Routes: `/login`, `/workspaces`, `/invite#<token>`, `/t/<tenantId>`, and its `/members`, `/settings`, `/modules`, `/audit` pages. Queries are keyed by tenant, cleared at login/logout and authorized server-side. Workspace branding changes persist in PostgreSQL and update theme tokens. Owners receive invitation links to copy privately. Custom domains remain configuration metadata.

`mock-api/server.mjs` is the original isolated UI fixture and is never started by the deployment or called by the integrated UI. It still models the historical authentication contract, so it is not a security test. Prefer the real API and integration suite for functional verification.

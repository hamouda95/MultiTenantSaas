# Deployment

## New deployment

1. Copy `.env.example` to `.env`. Set `POSTGRES_PASSWORD`, `APP_DATABASE_PASSWORD`, `CONTROL_DATABASE_PASSWORD` and `JWT_SECRET` to independent random values (`openssl rand -hex 32`). Passwords embedded in database URLs must be URL-safe or percent-encoded. Set `WEB_URL` to the exact public HTTPS origin, without a trailing slash.
2. Run `docker compose config --quiet` and `docker compose up --build -d` from the repository root. Both build targets use Node 22, frozen pnpm dependencies, and an unprivileged runtime user. The API image currently includes build tooling; image slimming can follow separately.
3. Put an HTTPS reverse proxy in front of `127.0.0.1:3000`. Preserve the browser's Origin. The API and database are private to the Compose network. Session cookies require HTTPS in production. Do not expose the API directly to the public Internet.
4. Confirm `docker compose ps` reports a healthy database/API and check login, workspace creation, invite acceptance and logout through the public origin.

`API_INTERNAL_URL` is read at request time by the Next.js proxy. Root Compose sets it to `http://api:4000`; no public backend URL is baked into browser bundles. Tenant mutations use JSON and validate the exact Origin. Native clients using cookies must also send that Origin. Bearer-authenticated API clients can omit Origin, but must use JSON.

The database init script applies migrations 00–05 only on an empty volume. The application role has NOBYPASSRLS. The control-plane role can bypass RLS for explicit identity, provisioning and membership operations, but cannot create databases/roles or mutate audit entries. Keep the control URL confined to the API. Never use the PostgreSQL superuser as the application role. The API refuses startup on an unavailable database or missing/short JWT secret.

## Existing database

Take a backup and test migration on a restored copy. Apply `02_invitations_and_integrity.sql`, `03_sessions.sql` `04_default_role_permissions.sql` and `05_business.sql` once as a migration operator, after schema 01. If old data contains cross-tenant role assignments, migration 02 intentionally fails; investigate those records before proceeding. Provision the control role/password and grants as in `init-database.sh`. Migration 00 no longer assigns a static application password; set it explicitly. The old `infra/docker/docker-compose.yml` is an infrastructure sandbox, not this deployment stack.

Migration 04 backfills the three default roles and their standard permissions for existing workspaces, without changing custom roles. Existing users with NULL password hashes need an operator-controlled account recovery or identity-provider migration; do not set a shared default password. Do not copy the original development credentials into production.

Rollback: restore the previous image only after assessing its email-only authentication vulnerability. Prefer a forward fix. Added tables can remain safely in place. Do not drop users, memberships, invitations or sessions to roll back a frontend problem. Backups and migration execution are operator responsibilities; this PR does not access live data.

## Operations and external integrations

- Preserve `postgres_data` and back it up. Recreating containers does not re-run migrations on an existing volume.
- Monitor `/health/live` and `/health/ready` inside the API network. Graceful shutdown closes database pools.
- Expired session rows can be pruned with `DELETE FROM auth_sessions WHERE expires_at < NOW()`. Expired pending invitations can be removed/recreated through member management; pending seats count toward the quota until removed.
- Authentication rate limiting is per API instance and uses its connection IP. Since the web proxy shares a connection IP, put shared account/IP rate limiting and request-size limits at the public reverse proxy before scaling. No forwarded IP is blindly trusted.
- Configure mail delivery/verification/recovery before offering self-service password recovery. Invitations currently use copyable links; no email is sent.
- AI providers, ingestion/storage, workers and dedicated database routing need implementation and separate integration testing. Domain settings do not configure DNS or certificates.

## Holding business upgrade

Migration 05 is additive and idempotent. Apply it to existing volumes before deploying the business API; restarting production Compose alone does not migrate existing volumes. The local launcher applies it automatically without deleting data. See [business implementation and commercial rollout limits](holding-business.md).

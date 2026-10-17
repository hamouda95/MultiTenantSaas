#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f /migrations/00_init_roles_and_extensions.sql
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DATABASE_PASSWORD" -v control_password="$CONTROL_DATABASE_PASSWORD" <<'SQL'
SELECT format('ALTER ROLE saas_app_user PASSWORD %L', :'app_password') \gexec
CREATE ROLE saas_control LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
SELECT format('ALTER ROLE saas_control PASSWORD %L', :'control_password') \gexec
SQL
for migration in /migrations/01*.sql /migrations/02*.sql /migrations/03*.sql; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$migration"
done
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
GRANT USAGE ON SCHEMA public TO saas_control;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO saas_control;
REVOKE UPDATE, DELETE ON audit_logs FROM saas_control;
SQL

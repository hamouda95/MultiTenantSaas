#!/bin/sh
# Disposable CI database ONLY; never points at a user's Neon project.
set -eu
for migration in infra/neon/0*.sql; do
 psql -v ON_ERROR_STOP=1 -f "$migration"
done
psql -v ON_ERROR_STOP=1 <<'SQL'
ALTER ROLE saas_runtime PASSWORD 'ci_app_password';
ALTER ROLE saas_control PASSWORD 'ci_control_password';
SQL

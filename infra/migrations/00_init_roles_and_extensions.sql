-- ==============================================================================
-- 00_init_roles_and_extensions.sql
-- Initializes PostgreSQL extensions, security roles, and base privileges.
-- ==============================================================================

-- 1. Enable Core & Vector Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Create Restricted Application Runtime Role (NO BYPASSRLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'saas_app_user') THEN
    CREATE ROLE saas_app_user WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END
$$;

-- 3. Base Schema Privileges for Application Role
GRANT USAGE ON SCHEMA public TO saas_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO saas_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO saas_app_user;

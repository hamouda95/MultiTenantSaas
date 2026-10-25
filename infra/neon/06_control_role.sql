-- Run as the Neon schema owner after 00–05. The application must NOT use that owner.
-- Passwords are intentionally not embedded. Set two independent passwords through
-- your secret-management/SQL operator workflow and use sslmode=verify-full URLs.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='saas_control') THEN
  CREATE ROLE saas_control LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public TO saas_control;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO saas_control;
REVOKE UPDATE,DELETE ON audit_logs FROM saas_control;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO saas_control;
-- Control-plane access to tenant data is deliberate and guarded by server checks.
-- Explicit policies avoid requiring Neon SUPERUSER/BYPASSRLS privileges.
DO $$ DECLARE tbl record; BEGIN
 FOR tbl IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity LOOP
  EXECUTE format('DROP POLICY IF EXISTS control_plane_access ON %I',tbl.relname);
  EXECUTE format('CREATE POLICY control_plane_access ON %I TO saas_control USING (true) WITH CHECK (true)',tbl.relname);
 END LOOP;
END $$;
COMMIT;

-- Additive pilot ledger: atomic commands, versioned snapshots and strict holding RLS.
BEGIN;
CREATE TABLE IF NOT EXISTS business_ledgers (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  state jsonb NOT NULL DEFAULT '{"companies":[],"locations":[],"products":[],"accounts":[],"partners":[],"orders":[],"invoices":[],"payments":[],"movements":[],"sales":[],"expenses":[],"cashTransfers":[],"access":[],"events":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(state)='object')
);
CREATE TABLE IF NOT EXISTS business_commands (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id)
);
ALTER TABLE business_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_ledgers FORCE ROW LEVEL SECURITY;
ALTER TABLE business_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_commands FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_ledgers' AND policyname='business_tenant') THEN
    CREATE POLICY business_tenant ON business_ledgers USING (tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_commands' AND policyname='business_tenant') THEN
    CREATE POLICY business_tenant ON business_commands USING (tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id',true),'')::uuid);
  END IF;
END $$;
GRANT SELECT,INSERT,UPDATE ON business_ledgers TO saas_app_user;
GRANT SELECT,INSERT ON business_commands TO saas_app_user;
COMMIT;

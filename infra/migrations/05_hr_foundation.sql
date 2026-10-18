-- HR foundation: additive, tenant-isolated records. Company grants are checked by API.
BEGIN;
INSERT INTO permissions (key, description) VALUES
  ('hr:manage', 'Manage employees, contracts and leave decisions')
ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  display_name varchar(255) NOT NULL CHECK (length(trim(display_name)) > 0),
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,company_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_employee_company ON hr_employees(tenant_id,company_id);
CREATE TABLE IF NOT EXISTS hr_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date,
  monthly_gross_minor bigint NOT NULL CHECK (monthly_gross_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,company_id,employee_id)
    REFERENCES hr_employees(tenant_id,company_id,id) ON DELETE CASCADE,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_hr_contract_employee ON hr_contracts(tenant_id,company_id,employee_id);
CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  decided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,company_id,employee_id)
    REFERENCES hr_employees(tenant_id,company_id,id) ON DELETE CASCADE,
  CHECK (ends_on >= starts_on),
  CHECK ((status='PENDING' AND decided_by IS NULL) OR
         (status <> 'PENDING' AND decided_by IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_employee ON hr_leave_requests(tenant_id,company_id,employee_id);
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['hr_employees','hr_contracts','hr_leave_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('DROP POLICY IF EXISTS hr_tenant_isolation ON %I',tab);
    EXECUTE format('CREATE POLICY hr_tenant_isolation ON %I USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())',tab);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO saas_app_user',tab);
  END LOOP;
END $$;
COMMIT;

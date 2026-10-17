CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id UUID UNIQUE NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  token_hash CHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON invitations;
CREATE POLICY tenant_isolation_policy ON invitations TO saas_app_user
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
-- Prevent a tenant-scoped assignment referencing another tenant's membership or role.
CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_id_tenant ON memberships(id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_id_tenant ON roles(id,tenant_id);
ALTER TABLE membership_roles ADD CONSTRAINT fk_membership_same_tenant FOREIGN KEY (membership_id,tenant_id) REFERENCES memberships(id,tenant_id) ON DELETE CASCADE;
ALTER TABLE membership_roles ADD CONSTRAINT fk_role_same_tenant FOREIGN KEY (role_id,tenant_id) REFERENCES roles(id,tenant_id) ON DELETE CASCADE;
ALTER TABLE invitations ADD CONSTRAINT fk_invitation_same_tenant FOREIGN KEY (membership_id,tenant_id) REFERENCES memberships(id,tenant_id) ON DELETE CASCADE;
REVOKE UPDATE, DELETE ON audit_logs FROM saas_app_user;
REVOKE ALL ON users, tenants, permissions, role_permissions FROM saas_app_user;
GRANT SELECT ON users, tenants, permissions, role_permissions TO saas_app_user;
REVOKE SELECT (password_hash) ON users FROM saas_app_user;
-- Grant only safe identity columns (table SELECT would include the password hash).
REVOKE SELECT ON users FROM saas_app_user;
GRANT SELECT (id,email,full_name,avatar_url,is_platform_admin,status,created_at,updated_at) ON users TO saas_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO saas_app_user;

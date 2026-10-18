-- Bring existing workspaces onto the same default roles as new provisioning.
-- Existing custom roles are unchanged; default role permission additions are additive.
INSERT INTO roles (tenant_id,name,description,is_system_role)
SELECT t.id, defaults.name, defaults.name || ' role', true
FROM tenants t CROSS JOIN (VALUES ('Owner'),('Member'),('Viewer')) AS defaults(name)
ON CONFLICT (tenant_id,name) DO NOTHING;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NOT NULL AND (
  r.name='Owner'
  OR (r.name IN ('Member','Viewer') AND p.key IN ('members:read','settings:read','quotas:read','documents:read'))
  OR (r.name='Member' AND p.key IN ('documents:write','ai:chat','ai:rag','ai:analytics'))
)
ON CONFLICT DO NOTHING;

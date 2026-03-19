BEGIN;

DELETE FROM auth.role_permissions
WHERE role_id IN (
  SELECT id FROM auth.roles WHERE role_key IN ('super_admin', 'dispatcher', 'operator', 'viewer')
);

DELETE FROM auth.roles
WHERE role_key IN ('super_admin', 'dispatcher', 'operator', 'viewer');

DELETE FROM auth.permissions
WHERE permission_key IN ('admin:access', 'audit:read', 'content:manage', 'dispatch:manage', 'fleet:read', 'fleet:manage', 'auth:self', 'users:manage');

COMMIT;

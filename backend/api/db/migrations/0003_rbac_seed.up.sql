BEGIN;

INSERT INTO auth.permissions (permission_key, description)
VALUES
  ('admin:access', 'Access the protected admin console.'),
  ('audit:read', 'Read authentication and operational audit trails.'),
  ('content:manage', 'Manage destination and display-facing content.'),
  ('dispatch:manage', 'Manage route and dispatch workflows.'),
  ('fleet:read', 'Inspect fleet, GPS, and device operational state.'),
  ('fleet:manage', 'Create, update, enable, disable, and override vehicle operational state.'),
  ('auth:self', 'Manage the signed-in account password and session state.'),
  ('users:manage', 'Create users and assign roles or permissions.')
ON CONFLICT (permission_key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO auth.roles (role_key, label, description)
VALUES
  ('super_admin', 'Super Admin', 'Owns platform setup, user administration, and privileged system actions.'),
  ('dispatcher', 'Dispatcher', 'Manages route, dispatch, and operational schedule workflows.'),
  ('operator', 'Operator', 'Manages display content and day-to-day operational publishing.'),
  ('viewer', 'Viewer', 'Read-only operational access to system and fleet state.')
ON CONFLICT (role_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM auth.roles r
JOIN auth.permissions p ON p.permission_key IN (
  CASE r.role_key
    WHEN 'super_admin' THEN 'admin:access'
    WHEN 'dispatcher' THEN 'admin:access'
    WHEN 'operator' THEN 'admin:access'
    WHEN 'viewer' THEN 'admin:access'
  END,
  CASE r.role_key
    WHEN 'super_admin' THEN 'audit:read'
    WHEN 'dispatcher' THEN 'audit:read'
    ELSE NULL
  END,
  CASE r.role_key
    WHEN 'super_admin' THEN 'content:manage'
    WHEN 'operator' THEN 'content:manage'
    ELSE NULL
  END,
  CASE r.role_key
    WHEN 'super_admin' THEN 'dispatch:manage'
    WHEN 'dispatcher' THEN 'dispatch:manage'
    ELSE NULL
  END,
  CASE r.role_key
    WHEN 'super_admin' THEN 'fleet:manage'
    WHEN 'dispatcher' THEN 'fleet:manage'
    WHEN 'operator' THEN 'fleet:manage'
    ELSE NULL
  END,
  'fleet:read',
  'auth:self',
  CASE r.role_key
    WHEN 'super_admin' THEN 'users:manage'
    ELSE NULL
  END
)
ON CONFLICT DO NOTHING;

COMMIT;

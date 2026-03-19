BEGIN;

CREATE TABLE auth.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT NOT NULL UNIQUE CHECK (role_key ~ '^[a-z][a-z0-9_]*$'),
  label TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL UNIQUE CHECK (permission_key ~ '^[a-z][a-z0-9:_-]*$'),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'locked')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE UNIQUE INDEX auth_user_roles_primary_user_uidx
  ON auth.user_roles (user_id)
  WHERE is_primary;

CREATE TABLE auth.role_permissions (
  role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE auth.password_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'pbkdf2_sha512',
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_active_user_idx
  ON auth.sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX auth_sessions_expiry_idx
  ON auth.sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX auth_users_status_email_idx
  ON auth.users (status, email);

CREATE INDEX auth_role_permissions_permission_idx
  ON auth.role_permissions (permission_id, role_id);

CREATE INDEX auth_user_roles_role_idx
  ON auth.user_roles (role_id, user_id);

CREATE VIEW auth.user_primary_roles AS
SELECT
  ur.user_id,
  r.id AS role_id,
  r.role_key,
  r.label,
  r.description
FROM auth.user_roles ur
JOIN auth.roles r ON r.id = ur.role_id
WHERE ur.is_primary;

CREATE VIEW auth.user_effective_permissions AS
SELECT DISTINCT
  ur.user_id,
  r.id AS role_id,
  r.role_key,
  p.id AS permission_id,
  p.permission_key
FROM auth.user_roles ur
JOIN auth.roles r ON r.id = ur.role_id
JOIN auth.role_permissions rp ON rp.role_id = ur.role_id
JOIN auth.permissions p ON p.id = rp.permission_id;

COMMIT;

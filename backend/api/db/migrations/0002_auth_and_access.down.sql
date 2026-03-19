BEGIN;

DROP VIEW IF EXISTS auth.user_effective_permissions;
DROP VIEW IF EXISTS auth.user_primary_roles;

DROP TABLE IF EXISTS auth.sessions;
DROP TABLE IF EXISTS auth.password_credentials;
DROP TABLE IF EXISTS auth.role_permissions;
DROP TABLE IF EXISTS auth.user_roles;
DROP TABLE IF EXISTS auth.users;
DROP TABLE IF EXISTS auth.permissions;
DROP TABLE IF EXISTS auth.roles;

COMMIT;

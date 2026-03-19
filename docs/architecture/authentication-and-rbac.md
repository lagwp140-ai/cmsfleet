# Authentication and RBAC

## Scope

The admin surface for the bus CMS is protected by a shared authentication boundary in [`backend/api/src/modules/auth`](/c:/Projects/cmsfleet/backend/api/src/modules/auth/module.ts). The design keeps tenant and vehicle differences in configuration while keeping identity, authorization, and audit behavior consistent across deployments.

## Decisions

- Use server-side cookie sessions for the web app instead of browser-stored JWTs.
- Hash passwords with PBKDF2-SHA512 using config-driven iterations, salt length, and minimum length.
- Define role permissions in config so deployments can evolve permissions without rewriting core auth code.
- Persist users, sessions, and auth audit events in PostgreSQL.
- Allow local bootstrap users only in the `local` environment.

## Runtime Flow

1. The frontend calls `POST /api/auth/login` with credentials.
2. The API verifies the stored password hash and creates a random session token.
3. The raw token is only sent back as an `HttpOnly` cookie; PostgreSQL stores an HMAC hash of the token.
4. Protected routes resolve the cookie, look up the session, hydrate the user, and enforce permission checks.
5. Password changes rotate sessions by deleting existing sessions for the user and issuing a fresh cookie.
6. Sign-in, sign-out, failed login, and password changes emit audit records.

## Data Model

The auth store manages three tables:

- `cms_auth_users`
- `cms_auth_sessions`
- `cms_auth_audit_events`

The current implementation creates these tables on API startup if they do not exist. That keeps the monorepo runnable early, while a later migration system can take ownership of schema evolution.

## Frontend Contract

The web app uses:

- `GET /api/auth/metadata` for public login-page metadata
- `GET /api/auth/session` for session hydration
- `POST /api/auth/login` and `POST /api/auth/logout` for auth lifecycle
- `POST /api/auth/password` for self-service password changes
- `GET /api/admin/dashboard` and `GET /api/admin/audit-events` for protected admin views

Frontend route protection lives in [`frontend/web/src/components/ProtectedRoute.tsx`](/c:/Projects/cmsfleet/frontend/web/src/components/ProtectedRoute.tsx).

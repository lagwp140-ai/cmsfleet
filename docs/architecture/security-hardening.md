# Security Hardening

The CMS now includes a baseline hardening layer intended for production-oriented deployments.

## Runtime Controls

- Security headers are applied to API responses, including `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and an API-focused `Content-Security-Policy`.
- `Strict-Transport-Security` is emitted when the request is effectively HTTPS and secure cookies are enabled.
- API responses under `/api/*` are marked `Cache-Control: no-store` to reduce credential and admin data exposure in shared browser caches.
- The Fastify server now honors `runtime.api.trustProxy`, which should be enabled when running behind Nginx or another reverse proxy.

## Session and CSRF Model

- Browser auth remains cookie-based with `HttpOnly` session cookies.
- Cookie `SameSite` behavior is now configuration-driven through `auth.session.sameSite`.
- Mutating authenticated requests require a derived CSRF header token. The token is derived server-side from the session token and the configured CSRF secret, so it does not need a second persistent browser cookie.
- The frontend client automatically captures and resubmits the CSRF header for `POST`, `PUT`, `PATCH`, and `DELETE` requests.
- Password changes rotate server-side sessions and issue a fresh authenticated session.

## Password Policy

Password policy is now fully configuration-driven under `auth.passwordPolicy`.

Supported controls:

- minimum length
- maximum length
- lowercase requirement
- uppercase requirement
- numeric requirement
- symbol requirement
- PBKDF2 iteration count and key sizes

Temporary admin-issued passwords are generated to satisfy the same policy used for user-entered passwords.

## Rate Limiting

The API now includes an in-memory rate limiter with separate buckets for:

- general authenticated and anonymous API traffic
- login attempts
- mutating API requests

This is intentionally lightweight for the MVP. For multi-instance deployments, move the counters to Redis or another shared store.

## Secret Handling

The configuration runtime now fails fast when:

- the session secret is shorter than 32 characters
- the CSRF secret is shorter than 32 characters
- non-local environments still use the local placeholder session or CSRF secret
- `SameSite=None` is configured without secure cookies

Recommended practice:

- inject secrets through environment files or a secret manager
- keep JSON config files free of production secrets
- use distinct secrets per environment
- rotate session and CSRF secrets as part of incident response or privileged-access rotation

## Database Least Privilege

The runtime validation now rejects obvious superuser-style database accounts in non-local environments, including usernames such as `postgres`, `root`, and `admin`, and common placeholder passwords.

Recommended database roles:

- `cmsfleet_app` for the API
- `cmsfleet_worker` for background services
- a separate migration role with elevated DDL privileges, used only during deployment

## Audit Coverage

Critical actions and security events now have explicit audit coverage, including:

- sign-in success and failure
- sign-out
- password change
- password reset
- user creation and update
- role and account-status changes
- CSRF validation failures

The current auth audit trail remains in `cms_auth_audit_events`. A future cleanup step should consolidate that into the canonical `system.audit_logs` schema.

## Remaining Gaps

The current pass improves the baseline, but a few production-grade items are still intentionally deferred:

- shared/distributed rate limiting for multi-instance deployments
- per-device authentication on GPS ingestion endpoints
- persistent display delivery/audit storage instead of in-memory queue state
- canonical auth storage migration from `cms_auth_*` to the normalized `auth` schema
- automated secret rotation workflows

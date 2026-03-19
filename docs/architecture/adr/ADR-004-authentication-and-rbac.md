# ADR-004 Authentication and Role-Based Access Control

## Status

Accepted

## Context

The bus CMS needs a shared login model across multiple deployments without pushing tenant-specific behavior into the application core. We also need auditable admin access, secure password handling, and a permission model that can evolve by configuration.

## Decision

We will use cookie-based server-side sessions backed by PostgreSQL for the Node.js API and React admin frontend.

Key choices:

- PBKDF2-SHA512 password hashing with config-driven policy settings
- role and permission definitions stored in CMS configuration
- audit-event persistence for sign-in, sign-out, failed login, and password changes
- local bootstrap users allowed only in `local`
- production runtime checks for secure cookies and non-placeholder session secrets

## Consequences

Positive:

- Session revocation and audit history live on the server side.
- Deployments can tune auth policy and permissions through config.
- The frontend can stay thin because the API owns session verification and authorization.

Tradeoffs:

- The API now depends on PostgreSQL even for auth bootstrap.
- Cross-service auth reuse will require a shared session strategy if more Node services expose admin APIs.
- The current schema bootstrapping should later be replaced by formal migrations.

# Testing Strategy

## Goals

The CMS test strategy is organized around fast feedback for pure logic, contract confidence for API behavior, and CI-friendly integration coverage for the operational workflows that matter most.

## Test Layers

### Unit tests

Unit tests focus on deterministic logic with minimal setup:

- authentication password hashing and temporary password generation
- configuration loading and override resolution
- GPS normalization and ingestion decision logic
- GTFS parsing and validation
- route resolution logic
- display command generation

These tests live primarily under `backend/api/tests/unit` and `backend/config-runtime/tests`.

### API tests

API tests exercise the Fastify modules through injected HTTP requests without requiring a live network listener.

Current API coverage includes:

- authentication login and session flow
- structured error envelope behavior
- admin user-management actions and audit-history responses

These tests live under `backend/api/tests/api` and use in-memory stores where appropriate so they stay fast and deterministic.

### Integration tests

Integration tests combine multiple modules in one workflow to verify that the CMS core behaves correctly across boundaries.

Current initial integration coverage includes:

- route resolution feeding display command generation for a dispatcher-facing vehicle workflow

These tests live under `backend/api/tests/integration`.

## Fixtures

### GTFS fixtures

GTFS parser tests use a minimal static fixture set in `backend/api/tests/fixtures/gtfs/minimal`.

The fixture keeps the test surface small while still covering:

- routes
- trips
- stops
- stop times
- calendar service definitions

### Test runtime configuration

Shared runtime test configuration is centralized in `backend/api/tests/helpers/config.ts`.

That helper loads the real configuration-first stack and applies test-safe environment overrides for:

- `NODE_ENV=test`
- local CORS origins
- a dedicated test database URL
- a deterministic session secret

## Test Database Setup

Database-backed integration can target a dedicated PostgreSQL instance instead of the main development database.

Recommended local test database startup:

```powershell
cd c:\Projects\cmsfleet
docker compose -f deploy/docker-compose.test.yml up -d
```

Recommended test database URL:

```text
postgres://postgres:postgres@127.0.0.1:5434/cmsfleet_test
```

The baseline helper is `backend/api/tests/helpers/test-database.ts`. It defines the expected connection string and migration directory for future migration-driven integration tests.

Before DB-backed tests run, apply the migrations to the test database using the existing migration workflow.

## CI-Friendly Commands

Root-level commands:

- `npm run test:unit`
- `npm run test:api`
- `npm run test:integration`
- `npm run test:ci`

Workspace-level commands:

- `npm --workspace @cmsfleet/backend-api run test`
- `npm --workspace @cmsfleet/config-runtime run test`

Recommended CI order:

1. install dependencies
2. start the test database when DB-backed integration is enabled
3. apply migrations to the test database
4. run `npm run test:ci`

## Current Scope

This initial suite is designed to protect the highest-risk core behavior first:

- configuration-first startup
- authentication and admin access control
- GPS ingestion normalization and state derivation
- GTFS parsing
- route resolution
- LED display command generation

As the platform grows, the next layer should add migration-driven PostgreSQL integration tests, GTFS dataset activation tests, and hardware-adapter delivery queue tests.
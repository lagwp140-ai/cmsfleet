# Backend API

Primary Node.js API for the CMS platform.

## Responsibilities

- Authentication and authorization boundaries
- CRUD workflows for content, routes, stops, fleet state, and GTFS operations
- Validation of inbound requests
- Transactional persistence to PostgreSQL
- Emission of async work for long-running tasks

## Configuration Model

The API boots from the shared `@cmsfleet/config-runtime` package. Deployment differences such as transport rules, branding, GPS providers, LED mappings, GTFS behavior, and feature flags are resolved from JSON profiles and environment overrides before the server starts.

## Database

The canonical PostgreSQL schema and migration files live in [backend/api/db](/c:/Projects/cmsfleet/backend/api/db/README.md). Domain tables are split across `auth`, `fleet`, `transit`, `operations`, `telemetry`, `config`, and `system` schemas so repository modules can grow without one giant persistence bucket.

## GTFS Pipeline

GTFS import and activation now live in [`backend/api/src/modules/gtfs`](/c:/Projects/cmsfleet/backend/api/src/modules/gtfs/module.ts). The module supports zip upload, local-path import, staging, validation error capture, versioned dataset activation, and rollback-ready retention of older datasets.

## Route Resolution

Route resolution now lives in [`backend/api/src/modules/routes`](/c:/Projects/cmsfleet/backend/api/src/modules/routes/module.ts). It evaluates manual route overrides first, enriches them with GTFS schedule context, persists one route-resolution snapshot per vehicle, and leaves a clean extension point for GPS-assisted matching later.

## LED Display Domain

The display abstraction now lives in [`backend/api/src/modules/displays`](/c:/Projects/cmsfleet/backend/api/src/modules/displays/module.ts). It models display modes, templates, preview rendering, structured command generation, and a queue-backed hardware adapter boundary so LED controller support can grow without coupling transport behavior to one physical protocol.

## API Contract

JSON APIs now use a unified transport envelope:

- Success: `{ success: true, data, meta }`
- Error: `{ success: false, error, meta }`

Machine-readable OpenAPI is served from `/api/openapi.json`, and a lightweight human-readable reference is available at `/api/docs`.

## Local Development

For the fastest local API bootstrap, use the repo-level scripts:

- `npm run dev:stack:up` to start PostgreSQL and Adminer
- `npm run dev:db:migrate` to apply the ordered SQL migrations
- `npm run dev:seed` to load demo GTFS and fleet data
- `npm run dev:api` or `npm run dev:start` to run the backend

The seeded local admin login is `admin@demo-city.local` / `Transit!Demo2026` when bootstrap users are enabled in the local profile.

## Security Hardening

The API now applies a baseline security layer for production-oriented deployments:

- secure response headers and `Cache-Control: no-store` on `/api/*`
- proxy-aware HTTPS handling through `runtime.api.trustProxy`
- in-memory rate limiting for login, general API traffic, and mutating requests
- derived CSRF token enforcement for authenticated `POST`, `PUT`, `PATCH`, and `DELETE` routes
- config-driven password complexity rules and safer temporary-password generation
- runtime rejection of placeholder session or CSRF secrets and superuser-style database credentials outside `local`

Operational details and rollout notes are documented in [`docs/architecture/security-hardening.md`](/c:/Projects/cmsfleet/docs/architecture/security-hardening.md).

## Observability

The API now exposes:

- `/health/live` for liveness
- `/health/ready` for readiness
- `/health` for aggregated component status
- `/metrics` for Prometheus-compatible scraping
- `/api/admin/observability/overview` for protected operator visibility into health, metrics summaries, and recent failures

See [`docs/architecture/production-observability.md`](/c:/Projects/cmsfleet/docs/architecture/production-observability.md) for the component model and deployment guidance.

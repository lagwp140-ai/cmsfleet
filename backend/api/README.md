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

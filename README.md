# cmsfleet

Production-oriented monorepo skeleton for a bus CMS platform.

The repository is organized to keep product-facing concerns, background processing, deployment assets, and architecture decisions in one place without forcing every service into the same runtime. Node.js is the default platform for the API and operational services, PostgreSQL is the system of record, and Java is reserved for compute-heavy GTFS or routing workloads when that tradeoff becomes worthwhile.

## Goals

- Lock architecture and conventions early.
- Keep the main API and frontend simple to extend.
- Separate HTTP, async processing, and specialized compute concerns.
- Make local setup predictable with shared config and env templates.
- Keep deployment differences in configuration instead of branching the core CMS code.

## Repository Layout

```text
.
|-- backend/
|   |-- api/
|   `-- config-runtime/
|-- config/
|   |-- cms/
|   |-- eslint/
|   |-- prettier/
|   `-- tsconfig/
|-- deploy/
|-- docs/
|   |-- architecture/
|   |   `-- adr/
|   `-- conventions/
|-- frontend/
|   `-- web/
|-- java-services/
|   `-- gtfs-processor/
|-- scripts/
|-- services/
|   `-- integration-worker/
`-- tests/
```

## Baseline Technology Choices

- Monorepo tooling: npm workspaces
- Backend API: Node.js + TypeScript + Fastify
- Frontend: React + Vite + TypeScript
- Primary database: PostgreSQL
- Database migrations: ordered SQL files under [`backend/api/db/migrations`](/c:/Projects/cmsfleet/backend/api/db/migrations)
- Background jobs: Node.js worker services
- Runtime configuration: JSON profiles + environment overrides + JSON Schema validation
- Heavy transit processing: Java services when needed

## Configuration-First Runtime Model

The CMS core stays the same across deployments. Variability moves into versioned configuration layers under [`config/cms`](/c:/Projects/cmsfleet/config/cms/README.md):

- tenant profiles for branding, locale, and tenant defaults
- transport profiles for route strategy, GTFS, and GPS behavior
- vehicle profiles for bus class and onboard capabilities
- device profiles for hardware and connectivity assumptions
- display profiles for LED mappings and controller settings
- environment-specific JSON overrides and env-var overrides for operational differences

All Node.js services load configuration through [`backend/config-runtime`](/c:/Projects/cmsfleet/backend/config-runtime/README.md). Invalid configuration fails startup immediately.

## Authentication and Access Control

The API now ships with a configuration-driven authentication boundary for the admin surface:

- cookie-based server-side sessions for the web app
- PBKDF2-SHA512 password hashing with configurable policy values
- config-defined roles for `super_admin`, `dispatcher`, `operator`, and `viewer`
- protected admin routes with permission checks in both the API and frontend router
- PostgreSQL-backed session state and audit events for sign-in, sign-out, failed login, and password changes
- local-only bootstrap users for development, disabled by policy outside `local`

## Vehicle and Device Management

The first fleet-management slice is now live across the API, database, and admin UI:

- CRUD endpoints for vehicles under [`backend/api/src/modules/vehicles`](/c:/Projects/cmsfleet/backend/api/src/modules/vehicles/module.ts)
- config-synced device and display profile catalogs sourced from [`config/cms`](/c:/Projects/cmsfleet/config/cms/README.md)
- transport profile assignment without changing core code per deployment
- operational status plus separate administrative enable and disable control
- manual route override support for dispatch-driven exceptions
- a dedicated vehicle registry screen in [`frontend/web/src/pages/VehiclesPage.tsx`](/c:/Projects/cmsfleet/frontend/web/src/pages/VehiclesPage.tsx)

## Route Resolution Engine

The platform now resolves the current operating service for each bus with a manual-first workflow:

- manual route assignment remains the authoritative route source in the MVP
- GTFS schedule support selects the active or upcoming trip, direction, and next stop candidate on that route
- versioned GTFS calendar data from `calendar.txt` and `calendar_dates.txt` is now loaded into PostgreSQL for service-day evaluation
- unresolved auto-mode vehicles are held in an explicit `awaiting_auto_match` state until GPS-assisted matching is added later
- operator visibility is available through [`frontend/web/src/pages/RoutesPage.tsx`](/c:/Projects/cmsfleet/frontend/web/src/pages/RoutesPage.tsx)
- architecture notes live in [`docs/architecture/route-resolution.md`](/c:/Projects/cmsfleet/docs/architecture/route-resolution.md)
## GPS Ingestion and Telemetry

The platform now includes a real-time GPS ingestion path for onboard modules:

- HTTP JSON ingestion at `POST /api/ingest/gps/http`
- payload validation and normalization of coordinates, timestamps, heading, and speed
- raw event persistence in `telemetry.gps_messages`, including rejected and duplicate messages
- hot-path coordinate updates in `telemetry.vehicle_positions`
- derived operational state in `telemetry.vehicle_operational_states` for last seen, connection health, movement state, speed, heading, and future enrichments
- config-driven online, stale, offline, and movement thresholds using `freshnessThresholdSeconds`, `offlineThresholdSeconds`, and `movementThresholdKph`
- admin visibility through [`frontend/web/src/pages/GpsPage.tsx`](/c:/Projects/cmsfleet/frontend/web/src/pages/GpsPage.tsx) and the architecture note in [`docs/architecture/gps-ingestion.md`](/c:/Projects/cmsfleet/docs/architecture/gps-ingestion.md)

## GTFS Import and Versioning

The platform now includes a versioned GTFS control path for route and trip data:

- GTFS zip upload and server-local path import from the admin UI
- parsing and validation of `routes.txt`, `stops.txt`, `trips.txt`, and `stop_times.txt`
- staging tables and validation error capture under the `operations` schema
- immutable dataset versions with activation of one selected dataset at a time
- rollback to a previously retained dataset without deleting historical versions
- import history and validation reporting in [`frontend/web/src/pages/GtfsPage.tsx`](/c:/Projects/cmsfleet/frontend/web/src/pages/GtfsPage.tsx)
- pipeline documentation in [`docs/architecture/gtfs-import-pipeline.md`](/c:/Projects/cmsfleet/docs/architecture/gtfs-import-pipeline.md)
## Getting Started

1. Install Node.js 22.x, npm 10.x, PostgreSQL 16+, and Java 21.
2. Copy the root and service-level `.env.example` files into real `.env` files.
3. Start PostgreSQL locally or via [`deploy/docker-compose.dev.yml`](/c:/Projects/cmsfleet/deploy/docker-compose.dev.yml).
4. Apply the database migrations described in [`backend/api/db/README.md`](/c:/Projects/cmsfleet/backend/api/db/README.md).
5. Run `npm install` from the repository root.
6. Validate config resolution with `npm run config:validate`.
7. Start the API with `npm run dev:api` and the frontend with `npm run dev:web`.

## Working Agreements

- Architecture decisions live in [`docs/architecture`](/c:/Projects/cmsfleet/docs/architecture).
- Coding and configuration conventions live in [`docs/conventions`](/c:/Projects/cmsfleet/docs/conventions).
- Runtime deployment data lives in [`config/cms`](/c:/Projects/cmsfleet/config/cms/README.md).
- Shared technical lint and TypeScript settings live in [`config`](/c:/Projects/cmsfleet/config).
- New domains should be added as focused modules, not as generic shared utility buckets.

## Next Implementation Steps

- Migrate the auth persistence layer from boot-time tables to the normalized `auth` schema.
- Connect mutation actor tracking to canonical auth users so fleet and config changes can record foreign-key-safe actor IDs.
- Expand GPS transport adapters from HTTP JSON into TCP gateway or MQTT connectors while keeping the shared service layer intact.
- Add GPS-assisted automatic trip matching on top of the manual and schedule-based route engine.
- Add CI to run config validation, lint, typecheck, unit tests, and migration validation.
- Add remote URL ingestion and scheduled GTFS sync workers on top of the existing dataset activation and calendar model.




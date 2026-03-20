# Architecture Overview

## System Intent

The platform manages transit-facing CMS concerns such as route content, signage content, operational metadata, and integrations with schedule or vehicle data providers.

## Runtime Roles

- `frontend/web`: operator-facing UI for content management, configuration, and status.
- `backend/api`: main HTTP API, authentication boundary, and transactional business logic.
- `services/integration-worker`: scheduled and event-driven background processing for vendor feeds, sync jobs, and outbound tasks.
- `backend/config-runtime`: shared configuration loader for Node services with schema validation and fail-fast startup.
- `java-services/gtfs-processor`: reserved for GTFS ingestion, graph building, or route computation where Java libraries or performance justify the extra runtime.
- `PostgreSQL`: source of truth for operational and CMS data.

## High-Level Data Flow

1. Operators use the web app to manage content and monitor platform state.
2. The web app calls the Node.js API over versioned HTTP endpoints.
3. The API boots with validated deployment configuration resolved from JSON profiles and environment overrides.
4. The API persists data to PostgreSQL and emits async work when long-running tasks are required.
5. Node.js workers load the same validated deployment configuration and handle operational jobs that do not require immediate user response.
6. Java services process GTFS or routing workloads and publish results back through controlled storage or database interfaces.

## Architectural Principles

- Keep synchronous request handling in the API.
- Push long-running or failure-prone integrations into worker services.
- Use Java only for bounded workloads that benefit from its ecosystem.
- Prefer module-level ownership over cross-cutting shared abstractions.
- Validate config and request boundaries early.
- Keep deployment variance in configuration instead of service forks.
## Roadmap Readiness

- The API exposes `GET /api/admin/platform/extensions` as a lightweight catalog of active MVP foundations and future extension seams.
- GPS ingestion, route resolution, and diagnostics now have explicit architecture hooks for MQTT or TCP adapters, GPS-assisted trip matching, stop proximity, ETA, notifications, incidents, and related roadmap modules.

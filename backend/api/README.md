# Backend API

Primary Node.js API for the CMS platform.

## Responsibilities

- Authentication and authorization boundaries
- CRUD workflows for content, routes, stops, and fleet-facing configuration
- Validation of inbound requests
- Transactional persistence to PostgreSQL
- Emission of async work for long-running tasks

## Configuration Model

The API boots from the shared `@cmsfleet/config-runtime` package. Deployment differences such as transport rules, branding, GPS providers, LED mappings, and feature flags are resolved from JSON profiles and environment overrides before the server starts.

## Database

The canonical PostgreSQL schema and migration files live in [ackend/api/db](/c:/Projects/cmsfleet/backend/api/db/README.md). Domain tables are split across uth, leet, 	ransit, operations, 	elemetry, config, and system schemas so repository modules can grow without one giant persistence bucket.

